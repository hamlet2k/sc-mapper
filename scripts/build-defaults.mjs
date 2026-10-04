// Builds src/data/defaults.json from Star Citizen's real game files:
//   data/raw/defaultProfile.xml   (Data/Libs/Config/defaultProfile.xml)
//   data/raw/global.ini           (Data/Localization/english/global.ini) - optional, for labels
//   data/raw/build_manifest.json  (build_manifest.json) - game version info
// Usage: node scripts/build-defaults.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const raw = (p) => new URL(`../data/raw/${p}`, import.meta.url);
const xml = readFileSync(raw('defaultProfile.xml'), 'utf8').replace(/^\uFEFF/, '').replace('encoding="utf-16"', 'encoding="utf-8"');

// ---- localization ---------------------------------------------------------
const loc = new Map();
if (existsSync(raw('global.ini'))) {
  for (const line of readFileSync(raw('global.ini'), 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = line.slice(0, i).replace(/,P$/, '').trim().toLowerCase();
    if (!loc.has(key)) loc.set(key, line.slice(i + 1).trim());
  }
}
const usedLoc = { hit: 0, miss: 0 };
function L(s) {
  if (!s || s === 'empty') return undefined;
  if (!s.startsWith('@')) return s;
  const v = loc.get(s.slice(1).toLowerCase());
  if (v) { usedLoc.hit++; return v.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim(); }
  usedLoc.miss++;
  return undefined;
}
function humanize(name) {
  return name
    .replace(/^(v|ui|pc|foip|eva|fps|mobiglas)_/i, (m) => (m.toLowerCase() === 'v_' ? '' : m))
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- parse ---------------------------------------------------------------
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name) => ['actionmap', 'action', 'inputdata', 'state'].includes(name),
});
const doc = parser.parse(xml);
const profile = doc.profile;

const SLOTS = { keyboard: 'kb', mouse: 'mo', joystick: 'js', gamepad: 'gp' };
const isEmpty = (v) => v == null || String(v).trim() === '' || v === 'empty' || v === '0' || v === ' ';

// Action maps that are developer/internal-only (not shown in the in-game Keybindings menu)
const INTERNAL_MAPS = new Set(['debug', 'flycam', 'server_renderer', 'RemoteRigidEntityController', 'character_customizer', 'IFCS_controls', 'ui_textfield', 'spaceship_auto_weapons', 'hacking', 'mapui']);

const maps = [];
let actionCount = 0, labeled = 0;
for (const am of profile.actionmap) {
  const mapLabel = L(am.UILabel) ?? humanize(am.name);
  const category = L(am.UICategory) ?? 'Other';
  const actions = [];
  for (const a of am.action ?? []) {
    const defaults = [];
    for (const [dev, slot] of Object.entries(SLOTS)) {
      const attr = a[dev];
      if (typeof attr === 'string') {
        if (!isEmpty(attr)) defaults.push({ slot, input: attr.trim() });
      } else if (attr && typeof attr === 'object') {
        const mode = attr.activationMode;
        if (!isEmpty(attr.input)) defaults.push({ slot, input: String(attr.input).trim(), ...(mode ? { mode } : {}) });
        for (const d of attr.inputdata ?? []) {
          if (!isEmpty(d.input)) defaults.push({ slot, input: String(d.input).trim(), ...(d.activationMode || mode ? { mode: d.activationMode || mode } : {}) });
        }
      }
    }
    const label = L(a.UILabel);
    const hidden = !a.UILabel || INTERNAL_MAPS.has(am.name);
    if (label) labeled++;
    actionCount++;
    actions.push({
      name: a.name,
      label: label ?? humanize(a.name),
      ...(L(a.UIDescription) && L(a.UIDescription) !== label ? { desc: L(a.UIDescription) } : {}),
      ...(a.activationMode ? { mode: a.activationMode } : {}),
      ...(hidden ? { hidden: true } : {}),
      d: defaults,
    });
  }
  const cat = am.UICategory && am.UICategory !== 'empty' ? am.UICategory : '';
  maps.push({ name: am.name, label: mapLabel, category, cat, ...(INTERNAL_MAPS.has(am.name) ? { hidden: true } : {}), actions });
}

const manifest = existsSync(raw('build_manifest.json')) ? JSON.parse(readFileSync(raw('build_manifest.json'), 'utf8')).Data : {};
const out = {
  meta: {
    game: 'Star Citizen',
    branch: manifest.Branch,
    version: manifest.Version,
    buildDate: manifest.BuildDateStamp,
    channel: manifest.Tag === 'public' ? 'LIVE' : manifest.Tag,
    source: 'Data/Libs/Config/defaultProfile.xml + Data/Localization/english/global.ini',
    sourceUrl: 'https://github.com/x3nnnonn/StarCitizenDiff/tree/908b76a0485036161ba700d369c7d92aca1c847b/P4kContents/Data/Libs/Config',
    generated: new Date().toISOString(),
  },
  maps,
};
writeFileSync(new URL('../src/data/defaults.json', import.meta.url), JSON.stringify(out));
console.log(`maps=${maps.length} actions=${actionCount} labeled=${labeled} locHit=${usedLoc.hit} locMiss=${usedLoc.miss}`);
console.log('bound defaults:', maps.flatMap((m) => m.actions).filter((a) => a.d.length).length);
