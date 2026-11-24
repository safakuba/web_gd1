import { readdir, stat, mkdir, writeFile, open } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = new URL('../public/assets/models/', import.meta.url)
const reportDir = new URL('../reports/', import.meta.url)

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collect(path))
    else if (/\.glb$/i.test(entry.name)) {
      const info = await stat(path)
      const handle = await open(path, 'r')
      const header = Buffer.alloc(20)
      await handle.read(header, 0, 20, 0)
      const jsonLength = header.readUInt32LE(12)
      const jsonBuffer = Buffer.alloc(jsonLength)
      await handle.read(jsonBuffer, 0, jsonLength, 20)
      await handle.close()
      const json = JSON.parse(jsonBuffer.toString('utf8'))
      const extensions = json.extensionsUsed ?? []
      files.push({
        file: relative(root.pathname, path),
        bytes: info.size,
        mebibytes: Number((info.size / 1024 / 1024).toFixed(2)),
        exceedsWebBudget: info.size > 15 * 1024 * 1024,
        meshes: json.meshes?.length ?? 0,
        images: json.images?.length ?? 0,
        animations: json.animations?.length ?? 0,
        meshopt: extensions.includes('EXT_meshopt_compression'),
        ktx2: extensions.includes('KHR_texture_basisu'),
      })
    }
  }
  return files
}

const models = (await collect(root.pathname)).sort((a, b) => b.bytes - a.bytes)
await mkdir(reportDir, { recursive: true })
await writeFile(new URL('model-assets.json', reportDir), JSON.stringify({
  generatedAt: new Date().toISOString(),
  webBudgetMiB: 15,
  totalBytes: models.reduce((sum, model) => sum + model.bytes, 0),
  models,
}, null, 2) + '\n')

console.table(models.map(({ file, mebibytes, meshes, images, animations, meshopt, ktx2, exceedsWebBudget }) => ({
  file, MiB: mebibytes, meshes, images, animations, meshopt, ktx2, over15MiB: exceedsWebBudget,
})))
