import { chmod, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, '.offline/12-podob-casu')
await rm(output, { recursive: true, force: true })
await mkdir(resolve(output, 'runtime'), { recursive: true })
await cp(resolve(root, 'dist'), resolve(output, 'dist'), { recursive: true })
const decoder = resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf')
await mkdir(resolve(output, 'dist/draco'), { recursive: true })
for (const file of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  await cp(resolve(decoder, file), resolve(output, 'dist/draco', file))
}
await cp(resolve(root, 'scripts/offline-server.mjs'), resolve(output, 'server.mjs'))
await cp(process.execPath, resolve(output, 'runtime/node'))
await chmod(resolve(output, 'runtime/node'), 0o755)
await writeFile(resolve(output, 'start.command'), `#!/bin/zsh\nSCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"\nexec "$SCRIPT_DIR/runtime/node" "$SCRIPT_DIR/server.mjs"\n`, { mode: 0o755 })
await writeFile(resolve(output, 'README.txt'), `12 PODOB ČASU — OFFLINE VERZE\n\n1. Dvakrát klikněte na start.command.\n2. Web se otevře na http://127.0.0.1:4173.\n3. Okno Terminálu ponechte během prezentace otevřené.\n4. Web neotvírejte přímo přes index.html / file://.\n\nBalíček obsahuje vlastní Node runtime, Draco dekodér. Nepotřebuje internet.\n`)
console.log(output)
