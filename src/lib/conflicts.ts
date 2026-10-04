import { contextOf, contextsOverlap, modeBucket } from './groups';
import type { Binding, Row } from './types';

export interface ConflictGroup { phys: string; entries: { row: Row; binding: Binding }[] }
export interface ConflictResult { groups: ConflictGroup[]; byRow: Map<string, Set<string>> }

/**
 * Find inputs bound to several actions that are live at the same time.
 * By default only overlaps involving at least one customized binding are reported, because the
 * stock profile overloads many inputs on purpose (mode-specific maps, tap vs. hold, etc.).
 */
export function findConflicts(rows: Row[], includeDefaultOverlaps = false): ConflictResult {
  const idx = new Map<string, { row: Row; binding: Binding }[]>();
  for (const row of rows) {
    if (row.hidden) continue;
    for (const b of row.bindings) {
      const list = idx.get(b.phys) ?? [];
      list.push({ row, binding: b });
      idx.set(b.phys, list);
    }
  }
  const groups: ConflictGroup[] = [];
  const byRow = new Map<string, Set<string>>();
  for (const [phys, list] of idx) {
    if (list.length < 2) continue;
    const hit = new Set<number>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (A.row.action === B.row.action) continue; // same action listed in several maps
        if (!includeDefaultOverlaps && !A.binding.custom && !B.binding.custom) continue;
        if (!contextsOverlap(contextOf(A.row.map), contextOf(B.row.map))) continue;
        if (modeBucket(A.binding.mode) !== modeBucket(B.binding.mode)) continue;
        if ((A.binding.multiTap ?? 1) !== (B.binding.multiTap ?? 1)) continue;
        hit.add(i); hit.add(j);
      }
    }
    if (!hit.size) continue;
    const entries = [...hit].sort((a, b) => a - b).map((i) => list[i]);
    groups.push({ phys, entries });
    for (const e of entries) {
      const s = byRow.get(e.row.id) ?? new Set<string>();
      s.add(phys);
      byRow.set(e.row.id, s);
    }
  }
  groups.sort((a, b) => Number(b.entries.some((e) => e.binding.custom)) - Number(a.entries.some((e) => e.binding.custom)) || b.entries.length - a.entries.length);
  return { groups, byRow };
}
