/**
 * Copy the built Vite application into Vercel's `public/` directory.
 *
 * Vercel serves `public/` from its CDN before invoking any function. Keeping the
 * frontend out of the Python function is important here: a cold FastAPI start
 * installs the scientific Python stack, so routing a JavaScript chunk through
 * the function can stall the first paint long enough for the browser to show a
 * blank page.
 */
import { cpSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'frontend', 'dist')
const publicDir = resolve(root, 'public')

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error(`Frontend build not found at ${dist}. Run the frontend build first.`)
  process.exit(1)
}

rmSync(publicDir, { recursive: true, force: true })
cpSync(dist, publicDir, { recursive: true })
console.log(`Prepared Vercel static output in ${publicDir}`)
