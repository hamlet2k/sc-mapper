// Devices view, Edit mode: "Press to bind". The next input pressed on the shown device picks the control to bind.
import type { PressHit } from './listen';
import { coveredInputs, type Callout } from './templates';

export type PressBindResult =
  /** the press came from another device: ignored (the page says which one it was) */
  | { kind: 'other'; slot: PressHit['slot']; instance: number; device?: string }
  /** this device: the callout that shows the pressed input (null = not on the picture) and the exact input to bind */
  | { kind: 'hit'; calloutId: string | null; input: string };

/**
 * Where a press lands on the shown slot's picture. A hit can name several forms of one physical input (a gamepad stick as an
 * axis or as a direction, an analog trigger as button or axis): the first one a callout shows wins, else the primary one.
 * The callout already selected wins over another callout that shows the same input.
 */
export function pressBindTarget(callouts: readonly Pick<Callout, 'id' | 'inputs'>[], slot: PressHit['slot'], instance: number, hit: PressHit, selectedId?: string | null): PressBindResult {
  if (hit.slot !== slot || hit.instance !== instance) return { kind: 'other', slot: hit.slot, instance: hit.instance, device: hit.device };
  const sel = selectedId ? callouts.find((c) => c.id === selectedId) : undefined;
  for (const input of hit.inputs) {
    if (sel && coveredInputs(sel).includes(input)) return { kind: 'hit', calloutId: sel.id, input };
    const c = callouts.find((x) => coveredInputs(x).includes(input));
    if (c) return { kind: 'hit', calloutId: c.id, input };
  }
  return { kind: 'hit', calloutId: null, input: hit.inputs[0] };
}
