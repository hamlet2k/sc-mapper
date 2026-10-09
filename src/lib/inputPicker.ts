/* Template editor: the inputs of the device a template is linked to, for picking a callout's input from a list (with which
 * callout already uses each one). Pure (unit-tested). */
import { GP_AXES, GP_BUTTONS, JS_AXES, isHatRest } from './capture';
import { HAT_DIRS, calloutTitle, editorMaxInputs, matchScore, type Callout, type DeviceIdentity, type DeviceTemplate } from './templates';

/** what is known about the device: from the connected device (Gamepad API: buttons, axes, hats from the axes' rest values)
 * or only the button count of a link rule (device not connected) */
export interface DeviceInputs {
  from: 'device' | 'rule';
  slot: 'js' | 'gp';
  buttons: number;
  /** game axis names present on the device (all of them for a gamepad / when unknown) */
  axes: string[];
  hats: number;
  label: string;
}
/** game names of the axes a joystick exposes, and its POV hats: Chrome exposes HID axes by usage (X, Y, Z, Rx, Ry, Rz,
 * Slider, Dial) and a POV hat as an extra axis resting outside [-1, 1] (index-based names, as capture.ts) */
export function padLayout(axes: readonly number[]): { axes: string[]; hats: number } {
  const names: string[] = [];
  let hats = 0;
  axes.forEach((v, i) => { if (isHatRest(v)) hats++; else if (JS_AXES[i]) names.push(JS_AXES[i]); });
  return { axes: names, hats };
}

/** the device inputs for the picker, or null (free typing only): the template must be linked to the device (its rules match
 * it) for the connected device's inputs; otherwise a link rule with a button count gives buttons 1..N */
export function deviceInputs(t: Pick<DeviceTemplate, 'match' | 'slot'>, ident: DeviceIdentity, pad?: { buttons: number; axesRest?: readonly number[]; name: string }): DeviceInputs | null {
  if (t.slot === 'gp') {
    if (!t.match.length && !pad) return null;
    return { from: pad && matchScore(t, ident) > 0 ? 'device' : 'rule', slot: 'gp', buttons: GP_BUTTONS.length, axes: [...GP_AXES, 'triggerl', 'triggerr'], hats: 0, label: pad?.name ?? 'gamepad' };
  }
  if (pad && matchScore(t, ident) > 0) {
    const l = pad.axesRest ? padLayout(pad.axesRest) : { axes: JS_AXES, hats: 0 };
    return { from: 'device', slot: 'js', buttons: pad.buttons, axes: l.axes, hats: l.hats, label: pad.name };
  }
  const n = Math.max(0, ...t.match.map((m) => m.buttons ?? 0));
  return n > 0 ? { from: 'rule', slot: 'js', buttons: n, axes: JS_AXES, hats: 0, label: `${n} buttons (link rule)` } : null;
}

export interface PickEntry { input: string; label: string; group: 'Buttons' | 'Hats' | 'Axes'; usedBy: { id: string; title: string }[] }
/** callouts using each input (by its own inputs, not derived ones) */
export function usage(callouts: readonly Callout[]): Map<string, { id: string; title: string }[]> {
  const m = new Map<string, { id: string; title: string }[]>();
  for (const c of callouts) for (const i of new Set(c.inputs)) if (i) m.set(i, [...(m.get(i) ?? []), { id: c.id, title: calloutTitle(c) }]);
  return m;
}
/** entries for a button-like input (buttons, hat directions) or an axis input */
export function pickEntries(d: DeviceInputs, callouts: readonly Callout[], kind: 'button' | 'axis'): PickEntry[] {
  const used = usage(callouts);
  const e = (input: string, label: string, group: PickEntry['group']): PickEntry => ({ input, label, group, usedBy: used.get(input) ?? [] });
  if (kind === 'axis') return d.axes.map((a) => e(a, a, 'Axes'));
  if (d.slot === 'gp') return GP_BUTTONS.map((b) => e(b, b, 'Buttons'));
  const out = Array.from({ length: d.buttons }, (_, i) => e(`button${i + 1}`, `Button ${i + 1}`, 'Buttons'));
  for (let h = 1; h <= d.hats; h++) for (const dir of HAT_DIRS) out.push(e(`hat${h}_${dir}`, `Hat ${h} ${dir}`, 'Hats'));
  return out;
}
/** how many inputs a multi-pick fills for a callout kind (min, max), or null when the kind takes one input per row */
export function multiPickRange(c: Pick<Callout, 'kind' | 'inputs'>, slot: 'js' | 'gp'): { min: number; max: number } | null {
  if (c.kind === 'switch' || c.kind === 'buttons') return { min: 2, max: editorMaxInputs(c.kind) };
  if (c.kind === 'encoder') return { min: 2, max: 3 };
  if (c.kind === 'hat' && slot === 'js' && !/^hat\d_/.test(c.inputs[0] ?? '')) return { min: 4, max: 5 }; // 4 buttons (+ push)
  return null;
}
