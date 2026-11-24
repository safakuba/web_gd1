import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exec } from 'node:child_process'

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const port = 4173
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.hdr': 'application/octet-stream',
  '.woff2': 'font/woff2',
}

createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${request.headers.host}`).pathname)
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, safePath)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream')
  response.setHeader('Cache-Control', 'no-store')
  createReadStream(file).on('error', () => {
    response.statusCode = 404
    response.end('Not found')
  }).pipe(response)
}).listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`
  console.log(`12 podob času běží na ${url}`)
  exec(`open "${url}"`)
})
