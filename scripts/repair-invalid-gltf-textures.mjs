import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [, , inputArg, outputArg] = process.argv
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/repair-invalid-gltf-textures.mjs input.glb output.glb')
  process.exit(1)
}

const source = await readFile(resolve(inputArg))
if (source.toString('utf8', 0, 4) !== 'glTF') throw new Error('Input is not a binary glTF file.')
const jsonLength = source.readUInt32LE(12)
const json = JSON.parse(source.toString('utf8', 20, 20 + jsonLength))
const binHeaderOffset = 20 + jsonLength
const binLength = source.readUInt32LE(binHeaderOffset)
const bin = source.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength)

const invalidTextures = new Set()
json.textures?.forEach((texture, index) => {
  const extensionSource = texture.extensions?.EXT_texture_webp?.source
  if (texture.source === undefined && extensionSource === undefined) invalidTextures.add(index)
})

let removed = 0
const removeInvalidTextureInfo = (owner, key) => {
  if (owner?.[key] && invalidTextures.has(owner[key].index)) {
    delete owner[key]
    removed += 1
  }
}

json.materials?.forEach((material) => {
  removeInvalidTextureInfo(material.pbrMetallicRoughness, 'baseColorTexture')
  removeInvalidTextureInfo(material.pbrMetallicRoughness, 'metallicRoughnessTexture')
  removeInvalidTextureInfo(material, 'normalTexture')
  removeInvalidTextureInfo(material, 'occlusionTexture')
  removeInvalidTextureInfo(material, 'emissiveTexture')
})

let jsonChunk = Buffer.from(JSON.stringify(json))
const jsonPadding = (4 - (jsonChunk.length % 4)) % 4
if (jsonPadding) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(jsonPadding, 0x20)])
let binChunk = bin
const binPadding = (4 - (binChunk.length % 4)) % 4
if (binPadding) binChunk = Buffer.concat([binChunk, Buffer.alloc(binPadding)])

const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length
const header = Buffer.alloc(12)
header.write('glTF', 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(totalLength, 8)
const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(jsonChunk.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(binChunk.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)

await writeFile(resolve(outputArg), Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]))
console.log(`Removed ${removed} invalid material texture reference(s): ${[...invalidTextures].join(', ')}`)
