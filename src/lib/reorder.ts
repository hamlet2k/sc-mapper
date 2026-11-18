// Drag-and-drop device order: turn "this device now sits here" into a renumbering of one slot kind (js or gp).
// The numbers a kind already uses stay the same set (js1, js2, js5 stay js1, js2, js5); only who holds which number changes,
// in list order. The permutation feeds slots.ts permuteSlotBindings / permuteSlots / permuteProfileDevices and
// devopts.ts permuteOptionInstances, so bindings, hardware, template picks and curves all follow their device.
import type { Perm } from './slots';

/** a copy of `list` with the item at `from` moved to `to` (indices clamped to the list) */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const dest = Math.max(0, Math.min(out.length - 1, to));
  const [it] = out.splice(from, 1);
  out.splice(dest, 0, it);
  return out;
}

/**
 * The renumbering for a new visual order. `order` lists the kind's current instance numbers in their new order, top to
 * bottom; position i takes the i-th smallest of those numbers. Returns old number -> new number for every slot that moves
 * (an empty map when nothing changes).
 */
export function reorderPerm(order: readonly number[]): Map<number, number> {
  const sorted = [...order].sort((a, b) => a - b);
  const perm = new Map<number, number>();
  order.forEach((n, i) => { if (sorted[i] !== n) perm.set(n, sorted[i]); });
  return perm;
}

/** the number each position in `order` will show after the reorder (the kind's numbers, ascending) */
export const positionNumbers = (order: readonly number[]): number[] => [...order].sort((a, b) => a - b);

/** convenience: move one slot (by its current number) to a list position, returning the permutation */
export function movePerm(order: readonly number[], instance: number, toIndex: number): Perm {
  const from = order.indexOf(instance);
  if (from < 0) return new Map();
  return reorderPerm(moveItem(order, from, toIndex));
}
