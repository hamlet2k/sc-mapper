import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tsImport } from 'tsx/esm/api'
import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'

type Feed = { files: Map<string, string>; problems: string[] }
/** the public template feed (docs/template-feed.md), generated from the built-in template objects by scripts/template-feed.ts */
const generateFeed = async (): Promise<Feed> =>
  (await tsImport('./scripts/template-feed.ts', import.meta.url) as { generateTemplateFeed: () => Promise<Feed> }).generateTemplateFeed()

/** CORS for the feed and the photos it references, as vercel.json sets on the live site (so other apps can try a local dev / preview server) */
const cors = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (/^\/(templates|device-photos)\//.test(req.url ?? '')) res.setHeader('Access-Control-Allow-Origin', '*')
  next()
}
const TYPES: Record<string, string> = { json: 'application/json; charset=utf-8', svg: 'image/svg+xml; charset=utf-8' }

/**
 * Writes dist/templates/index.json, dist/templates/<id>.json and dist/templates/art/<id>.svg on `vite build` (fails the build when a
 * template references a photo that is missing); serves the same files from memory under `vite` (dev).
 */
function templateFeed(): Plugin {
  let dev: Promise<Feed> | null = null
  return {
    name: 'template-feed',
    async generateBundle() {
      const { files, problems } = await generateFeed()
      if (problems.length) this.error(`template feed:\n  ${problems.join('\n  ')}`)
      for (const [fileName, source] of files) this.emitFile({ type: 'asset', fileName, source })
    },
    configureServer(server) {
      server.watcher.on('change', (f) => { if (/[\\/]src[\\/]lib[\\/]|[\\/]device-photos[\\/]/.test(f)) dev = null })
      server.middlewares.use(cors)
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!path.startsWith('/templates/')) return next()
        void (dev ??= generateFeed()).then(({ files }) => {
          const body = files.get(decodeURIComponent(path.slice(1)))
          if (body === undefined) { res.statusCode = 404; res.end('not found'); return }
          res.setHeader('Content-Type', TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream')
          res.end(body)
        }, (e: unknown) => { dev = null; next(e) })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use(cors)
    },
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version) },
  plugins: [react(), tailwindcss(), templateFeed()],
  // the licences of the npm packages bundled into dist/ (React, onnxruntime-web, …), served as /third-party-licenses.md
  build: { license: { fileName: 'third-party-licenses.md' } },
})
