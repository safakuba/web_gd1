import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [, , inputArg, outputArg] = process.argv
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/dedupe-glb-images.mjs input.glb output.glb')
  process.exit(1)
}

const input = resolve(inputArg)
const output = resolve(outputArg)
if (input === output) throw new Error('Input and output must be different; source GLB is never overwritten.')

const source = await readFile(input)
if (source.toString('utf8', 0, 4) !== 'glTF') throw new Error('Input is not a binary glTF file.')
const jsonLength = source.readUInt32LE(12)
const json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength))
if ((json.extensionsUsed ?? []).includes('EXT_meshopt_compression')) {
  throw new Error('This lossless deduplicator expects an uncompressed source GLB.')
}

const binHeader = 20 + jsonLength
const binLength = source.readUInt32LE(binHeader)
const binStart = binHeader + 8
const bin = source.subarray(binStart, binStart + binLength)

const imageRemap = new Map()
const uniqueImages = []
const hashes = new Map()
const duplicateImageViews = new Set()

for (let index = 0; index < (json.images ?? []).length; index += 1) {
  const image = json.images[index]
  if (image.bufferView === undefined) {
    imageRemap.set(index, uniqueImages.length)
    uniqueImages.push(image)
    continue
  }
  const view = json.bufferViews[image.bufferView]
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
  const key = `${image.mimeType ?? ''}:${createHash('sha256').update(bytes).digest('hex')}`
  const canonical = hashes.get(key)
  if (canonical !== undefined) {
    imageRemap.set(index, canonical.imageIndex)
    duplicateImageViews.add(image.bufferView)
  } else {
    const imageIndex = uniqueImages.length
    hashes.set(key, { imageIndex, bufferView: image.bufferView })
    imageRemap.set(index, imageIndex)
    uniqueImages.push(image)
  }
}

for (const texture of json.textures ?? []) {
  if (texture.source !== undefined) texture.source = imageRemap.get(texture.source)
  const basisu = texture.extensions?.KHR_texture_basisu
  if (basisu?.source !== undefined) basisu.source = imageRemap.get(basisu.source)
}
json.images = uniqueImages

const protectedViews = new Set()
for (const accessor of json.accessors ?? []) {
  if (accessor.bufferView !== undefined) protectedViews.add(accessor.bufferView)
  if (accessor.sparse?.indices?.bufferView !== undefined) protectedViews.add(accessor.sparse.indices.bufferView)
  if (accessor.sparse?.values?.bufferView !== undefined) protectedViews.add(accessor.sparse.values.bufferView)
}
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) protectedViews.add(image.bufferView)
}
for (const view of protectedViews) duplicateImageViews.delete(view)

const viewRemap = new Map()
const nextViews = []
const chunks = []
let byteOffset = 0
for (let index = 0; index < (json.bufferViews ?? []).length; index += 1) {
  if (duplicateImageViews.has(index)) continue
  const view = json.bufferViews[index]
  const padding = (4 - (byteOffset % 4)) % 4
  if (padding) {
    chunks.push(Buffer.alloc(padding))
    byteOffset += padding
  }
  const start = view.byteOffset ?? 0
  const bytes = bin.subarray(start, start + view.byteLength)
  viewRemap.set(index, nextViews.length)
  nextViews.push({ ...view, byteOffset })
  chunks.push(bytes)
  byteOffset += bytes.length
}

const remapView = (value) => {
  const mapped = viewRemap.get(value)
  if (mapped === undefined) throw new Error(`Removed bufferView ${value} is still referenced.`)
  return mapped
}
for (const accessor of json.accessors ?? []) {
  if (accessor.bufferView !== undefined) accessor.bufferView = remapView(accessor.bufferView)
  if (accessor.sparse?.indices?.bufferView !== undefined) accessor.sparse.indices.bufferView = remapView(accessor.sparse.indices.bufferView)
  if (accessor.sparse?.values?.bufferView !== undefined) accessor.sparse.values.bufferView = remapView(accessor.sparse.values.bufferView)
}
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) image.bufferView = remapView(image.bufferView)
}
json.bufferViews = nextViews

let nextBin = Buffer.concat(chunks)
const binPadding = (4 - (nextBin.length % 4)) % 4
if (binPadding) nextBin = Buffer.concat([nextBin, Buffer.alloc(binPadding)])
json.buffers[0].byteLength = nextBin.length

let nextJson = Buffer.from(JSON.stringify(json))
const jsonPadding = (4 - (nextJson.length % 4)) % 4
if (jsonPadding) nextJson = Buffer.concat([nextJson, Buffer.alloc(jsonPadding, 0x20)])

const header = Buffer.alloc(12)
header.write('glTF', 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + 8 + nextJson.length + 8 + nextBin.length, 8)
const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(nextJson.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const nextBinHeader = Buffer.alloc(8)
nextBinHeader.writeUInt32LE(nextBin.length, 0)
nextBinHeader.writeUInt32LE(0x004e4942, 4)

await mkdir(dirname(output), { recursive: true })
await writeFile(output, Buffer.concat([header, jsonHeader, nextJson, nextBinHeader, nextBin]))
const saved = source.length - (12 + 8 + nextJson.length + 8 + nextBin.length)
console.log(`Created ${output}`)
console.log(`Images: ${json.images.length}; removed duplicate image views: ${duplicateImageViews.size}`)
console.log(`Saved ${(saved / 1024 / 1024).toFixed(2)} MiB without changing image pixels.`)
