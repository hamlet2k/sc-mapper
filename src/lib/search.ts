import { comboLabel, groupOfSlot, normalizeCombo, tokenAliases, tokens } from './inputs';
import type { Group, Row, Slot } from './types';

interface Indexed {
  label: string;
  words: string[];
  name: string;
  map: string;
  desc: string;
  /** per binding: token alias sets */
  binds: { tokens: Set<string>[]; combo: string; label: string; group: Group; inst: number }[];
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
      group: groupOfSlot(b.slot),
      inst: b.instance,
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

/** A device-scoped term: "js1_button5", "js2:btn5", "kb1_lalt+n", "mo1_mouse2", "gp1_a", or "js2_*" (anything on js2) */
const SCOPED = /^(kb|mo|js|gp)(\d*)[_:](.*)$/;
export const isScopedTerm = (t: string) => SCOPED.test(t);
/** Exact match on device group + instance + the full input (every token, nothing extra). null when the term isn't scoped. */
function scopedScore(ix: Indexed, term: string): number | null {
  const m = SCOPED.exec(term);
  if (!m) return null;
  const g = groupOfSlot(m[1] as Slot);
  const inst = !m[2] ? undefined : Number(m[2]);
  const parts = m[3].split('+').map((p) => p.trim()).filter(Boolean);
  for (const b of ix.binds) {
    if (b.group !== g || (inst !== undefined && b.inst !== inst) || !b.tokens.length) continue;
    if (!parts.length || (parts.length === 1 && parts[0] === '*')) return 150;
    if (parts.length === b.tokens.length && parts.every((p) => b.tokens.some((s) => s.has(p)))) return 150;
  }
  return 0;
}

/** Score how well a binding matches a key-ish term. Returns 0 if no match. */
function keyScore(ix: Indexed, term: string): number {
  const scoped = scopedScore(ix, term);
  if (scoped !== null) return scoped;
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

export interface ParsedQuery {
  terms: string[]; keyTerms: string[];
  /** exact device-scoped inputs of which a row must match at least one (press-to-search: a stick as axis or direction) */
  anyOf?: string[];
}
const DEVICE_WORD = /^(kb|mo|js|gp)(\d*)$/;
/**
 * key:x / k:x are key terms. Device-scoped terms ("js1_button5") are exact key terms, and a device word followed by an input
 * ("js2 btn5", "kb lalt+n") is merged into one; a device word on its own ("js2") matches anything bound on that device.
 */
export function parseQuery(q: string): ParsedQuery {
  const terms: string[] = [];
  const keyTerms: string[] = [];
  const raw = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (w.startsWith('key:') || w.startsWith('k:')) {
      const v = w.slice(w.indexOf(':') + 1);
      if (v) keyTerms.push(v);
    } else if (SCOPED.test(w)) keyTerms.push(w);
    else if (DEVICE_WORD.test(w)) {
      const next = raw[i + 1];
      if (next && !next.includes(':') && !DEVICE_WORD.test(next)) { keyTerms.push(`${w}_${next}`); i++; } else keyTerms.push(`${w}_*`);
    } else terms.push(w);
  }
  return { terms, keyTerms };
}

/** Returns a score > 0 when the row matches every term, else 0. */
export function scoreRow(row: Row, q: ParsedQuery): number {
  const ix = index(row);
  let total = 0;
  if (q.anyOf?.length) {
    const best = Math.max(...q.anyOf.map((k) => keyScore(ix, k)));
    if (!best) return 0;
    total += best;
  }
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
