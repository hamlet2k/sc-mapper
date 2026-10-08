// Node side of the public template feed (src/lib/templateFeed.ts): sha256, photo bytes from public/, app version and commit.
// Used by the `template-feed` Vite plugin (vite.config.ts: emits dist/templates/ on `vite build`, serves /templates/ in dev) and the
// unit tests. CLI (writes the feed into a folder, e.g. to inspect it): npx tsx scripts/template-feed.ts [outDir=.tmp/template-feed]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateFeed } from '../src/lib/templateFeed';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');

/** the commit the site is built from: Vercel's env var, else git (none outside a checkout) */
export function buildCommit(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined; } catch { return undefined; }
}

export async function generateTemplateFeed(o: { generatedAt?: string; commit?: string | null; publicDir?: string } = {}) {
  const publicDir = o.publicDir ?? join(ROOT, 'public');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version?: string };
  return buildTemplateFeed({
    sha256,
    photoFile: (url) => { const f = join(publicDir, url); return existsSync(f) ? new Uint8Array(readFileSync(f)) : undefined; },
    generatedAt: o.generatedAt ?? new Date().toISOString(),
    appVersion: pkg.version,
    commit: o.commit === null ? undefined : o.commit ?? buildCommit(),
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? join(ROOT, '.tmp/template-feed'));
  const { files, problems } = await generateTemplateFeed();
  for (const [path, content] of files) { const f = join(out, path); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, content); }
  console.log(`[template-feed] ${files.size} files -> ${out}`);
  if (problems.length) { console.error(`[template-feed] problems:\n  ${problems.join('\n  ')}`); process.exit(1); }
}
