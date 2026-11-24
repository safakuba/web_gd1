import { cp, mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourceRoot = resolve(root, 'node_modules/three/examples/jsm/libs')
const targets = [resolve(root, 'public')]

try {
  await stat(resolve(root, 'dist'))
  targets.push(resolve(root, 'dist'))
} catch {
  // The dist target does not exist before the first build.
}

for (const target of targets) {
  await mkdir(resolve(target, 'basis'), { recursive: true })
  await mkdir(resolve(target, 'meshopt'), { recursive: true })
  await cp(resolve(sourceRoot, 'basis'), resolve(target, 'basis'), { recursive: true, force: true })
  await cp(resolve(sourceRoot, 'meshopt_decoder.module.js'), resolve(target, 'meshopt/meshopt_decoder.module.js'), { force: true })
}

console.log(`Runtime decoders copied to ${targets.length} target(s).`)
