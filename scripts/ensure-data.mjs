// Makes sure src/data/defaults.json exists before dev/build/test, and (re)generates the default device art (src/lib/defaultStickArt.ts, defaultThrottleArt.ts, defaultGamepadArt.ts).
// If it is missing, downloads the raw game files (pinned) into data/raw/ and runs build-defaults.
// Raw source: x3nnnonn/StarCitizenDiff (extracted P4K files), sc-alpha-4.10.0 LIVE build 4.10.193.11644.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const REF = process.env.SC_DATA_REF || '908b76a0485036161ba700d369c7d92aca1c847b';
const BASE = `https://raw.githubusercontent.com/x3nnnonn/StarCitizenDiff/${REF}`;
const FILES = {
  'defaultProfile.xml': 'P4kContents/Data/Libs/Config/defaultProfile.xml',
  'keybinding_localization.xml': 'P4kContents/Data/Libs/Config/keybinding_localization.xml',
  'global.ini': 'P4kContents/Data/Localization/english/global.ini',
  'build_manifest.json': 'build_manifest.json',
};
const out = new URL('../src/data/defaults.json', import.meta.url);
const rawDir = new URL('../data/raw/', import.meta.url);

if (existsSync(out) && !process.argv.includes('--force')) {
  console.log('[data] src/data/defaults.json present');
} else {
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
  for (const [name, path] of Object.entries(FILES)) {
    const dest = new URL(name, rawDir);
    if (existsSync(dest)) continue;
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) throw new Error(`[data] download failed ${res.status} for ${path}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`[data] fetched ${name}`);
  }
  await import('./build-defaults.mjs');
}

// default stick, throttle and gamepad art: original drawings generated from small 3D models; quick and deterministic, so always rebuilt
await import('./gen-default-stick.mjs');
await import('./gen-default-throttle.mjs');
await import('./gen-default-gamepad.mjs');
