import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [, , sourceArg, targetArg, outputArg, animationNameArg] = process.argv
if (!sourceArg || !targetArg || !outputArg) {
  console.error('Usage: node scripts/transplant-glb-animation.mjs source.glb target.glb output.glb [animation-name]')
  process.exit(1)
}

function parseGlb(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Not a binary glTF file.')
  const jsonLength = buffer.readUInt32LE(12)
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength))
  const binHeader = 20 + jsonLength
  const binLength = buffer.readUInt32LE(binHeader)
  return { json, bin: buffer.subarray(binHeader + 8, binHeader + 8 + binLength) }
}

const source = parseGlb(await readFile(resolve(sourceArg)))
const target = parseGlb(await readFile(resolve(targetArg)))
const animation = animationNameArg
  ? source.json.animations?.find((item) => item.name === animationNameArg)
  : source.json.animations?.[0]
if (!animation) throw new Error('Source animation was not found.')

const sourceTargetNames = new Set(animation.channels.map((channel) => source.json.nodes[channel.target.node]?.name))
if (sourceTargetNames.size !== 1) throw new Error('Expected a single animated node.')
const animatedNodeName = [...sourceTargetNames][0]
const targetNode = target.json.nodes.findIndex((node) => node.name === animatedNodeName)
if (targetNode < 0) throw new Error(`Target node ${animatedNodeName} was not found.`)

const accessorIndices = new Set()
animation.samplers.forEach((sampler) => {
  accessorIndices.add(sampler.input)
  accessorIndices.add(sampler.output)
})
const accessorRemap = new Map()
const extraChunks = []
let byteOffset = target.bin.length

for (const oldAccessorIndex of accessorIndices) {
  const accessor = structuredClone(source.json.accessors[oldAccessorIndex])
  const oldView = source.json.bufferViews[accessor.bufferView]
  const padding = (4 - (byteOffset % 4)) % 4
  if (padding) {
    extraChunks.push(Buffer.alloc(padding))
    byteOffset += padding
  }
  const start = oldView.byteOffset ?? 0
  const bytes = source.bin.subarray(start, start + oldView.byteLength)
  const newView = { ...oldView, buffer: 0, byteOffset }
  delete newView.target
  target.json.bufferViews.push(newView)
  accessor.bufferView = target.json.bufferViews.length - 1
  target.json.accessors.push(accessor)
  accessorRemap.set(oldAccessorIndex, target.json.accessors.length - 1)
  extraChunks.push(bytes)
  byteOffset += bytes.length
}

const transplanted = structuredClone(animation)
transplanted.name = animation.name
transplanted.samplers.forEach((sampler) => {
  sampler.input = accessorRemap.get(sampler.input)
  sampler.output = accessorRemap.get(sampler.output)
})
transplanted.channels.forEach((channel) => {
  channel.target.node = targetNode
})
target.json.animations = [transplanted]

let nextBin = Buffer.concat([target.bin, ...extraChunks])
const binPadding = (4 - (nextBin.length % 4)) % 4
if (binPadding) nextBin = Buffer.concat([nextBin, Buffer.alloc(binPadding)])
target.json.buffers[0].byteLength = nextBin.length

let nextJson = Buffer.from(JSON.stringify(target.json))
const jsonPadding = (4 - (nextJson.length % 4)) % 4
if (jsonPadding) nextJson = Buffer.concat([nextJson, Buffer.alloc(jsonPadding, 0x20)])
const totalLength = 12 + 8 + nextJson.length + 8 + nextBin.length
const header = Buffer.alloc(12)
header.write('glTF', 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(totalLength, 8)
const jsonHeader = Buffer.alloc(8)
jsonHeader.writeUInt32LE(nextJson.length, 0)
jsonHeader.writeUInt32LE(0x4e4f534a, 4)
const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(nextBin.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)

const output = resolve(outputArg)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, Buffer.concat([header, jsonHeader, nextJson, binHeader, nextBin]))
console.log(`Transplanted ${animation.name} → ${animatedNodeName}`)
console.log(`Created ${output} (${(totalLength / 1024 / 1024).toFixed(2)} MiB)`)
