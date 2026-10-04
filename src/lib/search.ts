import { comboLabel, normalizeCombo, tokenAliases, tokens } from './inputs';
import type { Row } from './types';

interface Indexed {
  label: string;
  words: string[];
  name: string;
  map: string;
  desc: string;
  /** per binding: token alias sets */
  binds: { tokens: Set<string>[]; combo: string; label: string }[];
}

const cache = new WeakMap<Row, Indexed>();
function index(row: Row): Indexed {
  let ix = cache.get(row);
  if (ix) return ix;
  const label = row.label.toLowerCase();
  ix = {
    label,
    words: label.split(/[^a-z0-9]+/).filter(Boolean),
    name: row.action.toLowerCase(),
    map: `${row.mapLabel} ${row.map}`.toLowerCase(),
    desc: (row.desc ?? '').toLowerCase(),
    binds: row.bindings.map((b) => ({
      tokens: tokens(b.input).map((t) => new Set(tokenAliases(t))),
      combo: normalizeCombo(b.input),
      label: comboLabel(b.input, b.slot).toLowerCase(),
    })),
  };
  cache.set(row, ix);
  return ix;
}

function fuzzy(hay: string, needle: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return false;
}

/** Score how well a binding matches a key-ish term. Returns 0 if no match. */
function keyScore(ix: Indexed, term: string): number {
  let best = 0;
  if (term.includes('+')) {
    const parts = term.split('+').filter(Boolean);
    for (const b of ix.binds) {
      if (b.combo === normalizeCombo(term)) return 140;
      if (parts.length === b.tokens.length && parts.every((p) => b.tokens.some((s) => s.has(p)))) best = Math.max(best, 130);
      else if (parts.every((p) => b.tokens.some((s) => s.has(p)))) best = Math.max(best, 90);
    }
    return best;
  }
  for (const b of ix.binds) {
    const single = b.tokens.length === 1;
    for (const s of b.tokens) {
      if (s.has(term)) best = Math.max(best, single ? 120 : 100);
    }
    if (term.length >= 3 && b.label.includes(term)) best = Math.max(best, 60);
  }
  return best;
}

export interface ParsedQuery { terms: string[]; keyTerms: string[] }
export function parseQuery(q: string): ParsedQuery {
  const terms: string[] = [];
  const keyTerms: string[] = [];
  for (const raw of q.toLowerCase().trim().split(/\s+/).filter(Boolean)) {
    if (raw.startsWith('key:') || raw.startsWith('k:')) {
      const v = raw.slice(raw.indexOf(':') + 1);
      if (v) keyTerms.push(v);
    } else terms.push(raw);
  }
  return { terms, keyTerms };
}

/** Returns a score > 0 when the row matches every term, else 0. */
export function scoreRow(row: Row, q: ParsedQuery): number {
  const ix = index(row);
  let total = 0;
  for (const k of q.keyTerms) {
    const s = keyScore(ix, k);
    if (!s) return 0;
    total += s;
  }
  for (const t of q.terms) {
    let s = keyScore(ix, t);
    if (t.length === 1) {
      if (ix.words.includes(t)) s = Math.max(s, 50);
    } else {
      if (ix.words.some((w) => w === t)) s = Math.max(s, 95);
      else if (ix.words.some((w) => w.startsWith(t))) s = Math.max(s, 70);
      if (t.length >= 3) {
        if (ix.label.includes(t)) s = Math.max(s, 55);
        if (ix.name.includes(t)) s = Math.max(s, 45);
        if (ix.map.includes(t)) s = Math.max(s, 30);
        if (t.length >= 4 && ix.desc.includes(t)) s = Math.max(s, 15);
        if (!s && fuzzy(ix.label, t)) s = 10;
        if (!s && fuzzy(ix.name, t)) s = 8;
      } else if (ix.name.split('_').includes(t)) s = Math.max(s, 40);
    }
    if (!s) return 0;
    total += s;
  }
  return total || 1;
}
