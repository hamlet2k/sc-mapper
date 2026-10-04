// Quick headless self-test of parsing, merging, search and conflicts.
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
(globalThis as any).DOMParser = DOMParser;
const { buildRows } = await import('../src/lib/merge');
const { findConflicts } = await import('../src/lib/conflicts');
const { parseActionMaps } = await import('../src/lib/importer');
const { parseQuery, scoreRow } = await import('../src/lib/search');
const defaults = JSON.parse(readFileSync('src/data/defaults.json', 'utf8'));

const search = (rows: any[], q: string) => rows.filter((r) => !r.hidden).map((r) => ({ r, s: scoreRow(r, parseQuery(q)) })).filter((x) => x.s).sort((a, b) => b.s - a.s);
const base = buildRows(defaults, null);
const c0 = findConflicts(base, true);
console.log('default rows', base.length, 'visible', base.filter((r) => !r.hidden).length, 'conflict groups', c0.groups.length);
for (const g of c0.groups.slice(0, 12)) console.log('  ', g.phys, '=>', g.entries.map((e) => `${e.row.map}/${e.row.action}[${e.binding.mode ?? ''}]`).join(' | '));
for (const q of ['quantum', 'lalt+n', 'f', 'key:f', 'mouse2', 'landing', 'qntm', 'alt+1', 'mining laser', 'btn12']) {
  const res = search(base, q);
  console.log(`search "${q}" -> ${res.length}:`, res.slice(0, 5).map((x) => `${x.r.label}(${x.s})`).join('; '));
}
for (const f of process.argv.slice(2)) {
  const p = parseActionMaps(readFileSync(f, 'utf8'), f.split('/').pop()!);
  const rows = buildRows(defaults, p);
  const c = findConflicts(rows);
  console.log(`\n${f}: name=${p.name} rebinds=${p.rebindCount} devices=${JSON.stringify(p.devices)}`);
  console.log(' customized rows', rows.filter((r) => r.customized).length, 'unlisted', rows.filter((r) => r.unlisted).map((r) => r.id), 'cleared', rows.filter((r) => r.cleared.length).map((r) => r.id));
  console.log(' conflicts', c.groups.length, 'custom conflicts:', c.groups.filter((g) => g.entries.some((e) => e.binding.custom)).map((g) => g.phys + ' => ' + g.entries.map((e) => e.row.action).join('|')).slice(0, 8));
  const yaw = rows.find((r) => r.id === 'spaceship_movement/v_yaw');
  console.log(' v_yaw', JSON.stringify(yaw?.bindings));
}
