// Node ESM loader: allow extensionless relative imports (Vite convention).
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const url = new URL(`./src/${specifier.slice(2)}`, import.meta.url)
    for (const candidate of [url.href, `${url.href}.js`, `${url.href}/index.js`]) {
      try {
        if (existsSync(fileURLToPath(candidate))) return { url: candidate, shortCircuit: true }
      } catch { /* ignore */ }
    }
  }
  if (specifier.startsWith('.') && !/\.[cm]?js$/.test(specifier)) {
    const base = context.parentURL
    try {
      return await nextResolve(specifier, context)
    } catch {
      for (const candidate of [`${specifier}.js`, `${specifier}/index.js`]) {
        const url = new URL(candidate, base)
        if (existsSync(fileURLToPath(url))) {
          return { url: pathToFileURL(fileURLToPath(url)).href, shortCircuit: true }
        }
      }
    }
  }
  return nextResolve(specifier, context)
}
