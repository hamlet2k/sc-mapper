// Pure input-name mapping used by the binding editor: browser events / Gamepad API -> Star Citizen input names.
import { isModifier, normalizeCombo, parseRebindInput, tokens } from './inputs';
import type { Group, Rebind, Slot } from './types';

/* ------------------------------------------------------------------ keyboard */
// KeyboardEvent.code is the physical key (layout independent), which matches how the game names keys
// (DirectInput scancodes with US-layout names, CryEngine key ids).
const CODE: Record<string, string> = {
  Escape: 'escape', Minus: 'minus', Equal: 'equals', Backspace: 'backspace', Tab: 'tab', Enter: 'enter',
  BracketLeft: 'lbracket', BracketRight: 'rbracket', Semicolon: 'semicolon', Quote: 'apostrophe', Backquote: 'tilde',
  Backslash: 'backslash', IntlBackslash: 'oem_102', Comma: 'comma', Period: 'period', Slash: 'slash', Space: 'space',
  CapsLock: 'capslock', NumLock: 'numlock', ScrollLock: 'scrolllock', PrintScreen: 'print', Pause: 'pause',
  Insert: 'insert', Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pgup', PageDown: 'pgdn',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  ShiftLeft: 'lshift', ShiftRight: 'rshift', ControlLeft: 'lctrl', ControlRight: 'rctrl', AltLeft: 'lalt', AltRight: 'ralt',
  MetaLeft: 'lwin', MetaRight: 'rwin', ContextMenu: 'apps',
  NumpadDecimal: 'np_period', NumpadAdd: 'np_add', NumpadSubtract: 'np_subtract', NumpadMultiply: 'np_multiply',
  NumpadDivide: 'np_divide', NumpadEnter: 'np_enter',
};
for (let i = 0; i <= 9; i++) { CODE[`Digit${i}`] = String(i); CODE[`Numpad${i}`] = `np_${i}`; }
for (let i = 1; i <= 15; i++) CODE[`F${i}`] = `f${i}`;
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') CODE[`Key${c}`] = c.toLowerCase();

/** Star Citizen key name for a KeyboardEvent.code, or undefined if the game has no name for it */
export const scKeyFromCode = (code: string): string | undefined => CODE[code];
export const ALL_SC_KEYS = Object.values(CODE);
/** Keys the game does not let you bind (console key, Windows keys) */
export const RESERVED_KEYS = new Set(['tilde', 'lwin', 'rwin']);

/** Build a combo string: modifiers in the order they were pressed, then the main key ("lalt+n") */
export function comboFrom(mods: string[], key?: string): string {
  const uniq = [...new Set(mods.filter(isModifier))];
  if (!key) return uniq.join('+');
  return [...uniq.filter((m) => m !== key), key].join('+');
}

/* --------------------------------------------------------------------- mouse */
// MouseEvent.button: 0 left, 1 middle, 2 right, 3 back, 4 forward
const MOUSE_BTN = ['mouse1', 'mouse3', 'mouse2', 'mouse4', 'mouse5'];
export const scMouseButton = (button: number): string | undefined => MOUSE_BTN[button];
export const scWheel = (deltaY: number): string | undefined => (deltaY < 0 ? 'mwheel_up' : deltaY > 0 ? 'mwheel_down' : undefined);
export const MOUSE_AXES = [
  { input: 'maxis_x', label: 'Mouse X axis' },
  { input: 'maxis_y', label: 'Mouse Y axis' },
  { input: 'maxis_z', label: 'Wheel axis (maxis_z)' },
];

/* ------------------------------------------------------- gamepad (standard) */
// W3C "standard" Gamepad mapping (XInput pads) -> gp1_ names as used in defaultProfile.xml
export const GP_BUTTONS = [
  'a', 'b', 'x', 'y', 'shoulderl', 'shoulderr', 'triggerl_btn', 'triggerr_btn',
  'back', 'start', 'thumbl', 'thumbr', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right',
];
export const GP_AXES = ['thumblx', 'thumbly', 'thumbrx', 'thumbry'];
/** directional alternatives for stick axes: [negative, positive] (Gamepad API Y axis is negative when pushed up) */
const GP_AXIS_DIRS: [string, string][] = [
  ['thumbl_left', 'thumbl_right'], ['thumbl_up', 'thumbl_down'], ['thumbr_left', 'thumbr_right'], ['thumbr_up', 'thumbr_down'],
];

/* --------------------------------------------------------- joystick / HOTAS */
// Chrome on Windows exposes HID axes by usage: X, Y, Z, Rx, Ry, Rz, Slider, Dial, Wheel, Hat switch (index 9).
export const JS_AXES = ['x', 'y', 'z', 'rotx', 'roty', 'rotz', 'slider1', 'slider2'];
export const jsButton = (index: number) => `button${index + 1}`; // the game is 1-based
const HAT_DIRS = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
/** A hat exposed as an axis rests outside [-1, 1] (Chrome: 9/7 ~ 1.2857) and steps through 8 positions */
export const isHatRest = (v: number) => Math.abs(v) > 1.05;
export function hatDirection(v: number): string | undefined {
  if (Math.abs(v) > 1.05) return undefined;
  const i = Math.round(((v + 1) / 2) * 7);
  const d = HAT_DIRS[Math.max(0, Math.min(7, i))];
  return d.includes('-') ? undefined : d; // diagonals have no name in the game
}

/* ---------------------------------------------------- Gamepad API snapshots */
export interface PadState { buttons: boolean[]; values: number[]; axes: number[] }
export function snapshot(p: { buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[] }): PadState {
  return { buttons: p.buttons.map((b) => b.pressed || b.value > 0.5), values: p.buttons.map((b) => b.value), axes: [...p.axes] };
}

export type PadEvent =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; dir: -1 | 1 }
  | { kind: 'hat'; index: number; dir: string; hat?: number };

export const AXIS_THRESHOLD = 0.5;

/** Inputs that changed relative to the resting snapshot. Axes count only when they moved past the threshold from rest. */
export function detect(rest: PadState, cur: PadState, threshold = AXIS_THRESHOLD): PadEvent[] {
  const out: PadEvent[] = [];
  cur.buttons.forEach((p, i) => { if (p && !rest.buttons[i]) out.push({ kind: 'button', index: i }); });
  cur.axes.forEach((v, i) => {
    const r = rest.axes[i] ?? 0;
    if (isHatRest(r)) {
      const d = hatDirection(v);
      if (d) out.push({ kind: 'hat', index: i, dir: d });
      return;
    }
    if (Math.abs(v - r) >= threshold) out.push({ kind: 'axis', index: i, dir: v > r ? 1 : -1 });
  });
  return out;
}

export interface Candidate { input: string; label: string; alt?: { input: string; label: string }[]; warning?: string }

/** Map a detected event to a game input name for a standard-mapping gamepad */
export function gamepadInput(e: PadEvent): Candidate | undefined {
  if (e.kind === 'button') {
    const n = GP_BUTTONS[e.index];
    if (!n) return undefined;
    if (n === 'triggerl_btn' || n === 'triggerr_btn') {
      const axis = n.replace('_btn', '');
      return { input: n, label: n, alt: [{ input: n, label: 'Button' }, { input: axis, label: 'Analog axis' }] };
    }
    return { input: n, label: n };
  }
  if (e.kind === 'axis') {
    const n = GP_AXES[e.index];
    if (!n) return undefined;
    const dir = GP_AXIS_DIRS[e.index][e.dir < 0 ? 0 : 1];
    return { input: n, label: n, alt: [{ input: n, label: 'Axis' }, { input: dir, label: 'Direction' }] };
  }
  return undefined;
}

/** Map a detected event to a game input name for a joystick / HOTAS (non-standard mapping) */
export function joystickInput(e: PadEvent, axisNames: string[] = JS_AXES): Candidate | undefined {
  if (e.kind === 'button') return { input: jsButton(e.index), label: jsButton(e.index) };
  if (e.kind === 'hat') { const n = `hat${e.hat ?? 1}_${e.dir}`; return { input: n, label: n }; }
  // Browser axis order follows HID usages (X, Y, Z, Rx, Ry, Rz, Slider, Dial...), which usually but not always matches the game:
  // offer every axis name, preselecting the likely one. Axes past the known names still get a choice instead of being ignored.
  const n = axisNames[e.index];
  return {
    input: n ?? axisNames[axisNames.length - 1], label: n ?? `axis ${e.index + 1}`,
    alt: axisNames.map((a) => ({ input: a, label: a === n ? `${a} (detected)` : a })),
    ...(n ? {} : { warning: `Browser axis #${e.index + 1} has no standard Star Citizen name. Pick the axis the game shows for it.` }),
  };
}

/* ------------------------------------------------------------ live capture */
/** Chromium (Chrome, Edge, Opera) exposes at most this many buttons / axes per device; buttons above 32 are invisible to the page */
export const CHROMIUM_BUTTON_CAP = 32;
export const CHROMIUM_AXIS_CAP = 16;
/** after a device first shows up, its axes are re-baselined for this long (the first report can be all zeros) */
export const SETTLE_MS = 300;

interface Tracked { rest: PadState; settleUntil: number; wake: Set<number> }

/**
 * Turns successive Gamepad API polls into input events, robust to how real browsers behave:
 * - controllers are hidden until a button is pressed, so a device that appears mid-capture is reporting the very press that woke
 *   it: those held buttons are counted when released (toggle switches that stay on never fire);
 * - buttons already held when listening starts (or toggles) are ignored until released, then their next press counts;
 * - axes are compared with where they rest (throttles parked at -1); a device that appears mid-capture is re-baselined during
 *   its first few hundred ms (its first report can be all zeros);
 * - a hat axis rests outside [-1, 1] (Chrome 1.2857, Firefox 3.2857); one first seen at 0 is fixed up when it reports centre.
 * Feed it fresh snapshots every frame (Chrome returns copies from getGamepads(), so old references never change).
 */
export class PadTracker {
  private pads = new Map<string, Tracked>();
  private polls = 0;
  private settleMs: number;
  private threshold: number;
  constructor(settleMs = SETTLE_MS, threshold = AXIS_THRESHOLD) { this.settleMs = settleMs; this.threshold = threshold; }

  /** One poll of every connected device. Returns the events per device key (empty when nothing new happened). */
  update(list: { key: string; state: PadState }[], now: number): Map<string, PadEvent[]> {
    const firstPoll = this.polls++ === 0;
    const out = new Map<string, PadEvent[]>();
    for (const { key, state } of list) {
      let t = this.pads.get(key);
      if (!t) {
        const wake = new Set<number>();
        if (!firstPoll) state.buttons.forEach((p, i) => { if (p) wake.add(i); });
        t = { rest: { buttons: [...state.buttons], values: [...state.values], axes: [...state.axes] }, settleUntil: firstPoll ? now : now + this.settleMs, wake };
        this.pads.set(key, t);
        out.set(key, []);
        continue;
      }
      const ev: PadEvent[] = [];
      const r = t.rest;
      state.buttons.forEach((p, i) => {
        if (t!.wake.has(i)) {
          if (!p) { t!.wake.delete(i); r.buttons[i] = false; ev.push({ kind: 'button', index: i }); }
          return;
        }
        if (p && !r.buttons[i]) ev.push({ kind: 'button', index: i });
        else if (!p && r.buttons[i]) r.buttons[i] = false;
      });
      const settling = now < t.settleUntil;
      state.axes.forEach((v, i) => {
        const rv = r.axes[i];
        if (settling || rv === undefined) { r.axes[i] = v; return; }
        if (!isHatRest(rv) && isHatRest(v)) { r.axes[i] = v; return; }
        if (isHatRest(rv)) {
          const d = hatDirection(v);
          if (d) ev.push({ kind: 'hat', index: i, dir: d, hat: 1 + r.axes.slice(0, i).filter(isHatRest).length });
          return;
        }
        if (Math.abs(v - rv) >= this.threshold) ev.push({ kind: 'axis', index: i, dir: v > rv ? 1 : -1 });
      });
      out.set(key, ev);
    }
    return out;
  }
  /** resting snapshot for a device (for diagnostics) */
  restOf(key: string): PadState | undefined { return this.pads.get(key)?.rest; }
}

/* -------------------------------------------------------------- manual entry */
const KM_TOKEN = /^(mouse[1-8](_\d)?|mwheel_(up|down)|maxis_[xyz]|f\d{1,2}|np_\w+|[a-z0-9]|[a-z_]+\d*)$/;
const JS_TOKEN = /^(button\d{1,3}|hat[1-4]_(up|down|left|right)|x|y|z|rotx|roty|rotz|slider[12]|throttlez)$/;
const GP_TOKEN = /^(a|b|x|y|shoulder[lr]|trigger[lr](_btn)?|trigger[lr]_[lr]_btn|back|start|thumb[lr]|thumb[lr][xy]|thumb[lr]_(up|down|left|right)|dpad_(up|down|left|right))$/;

/**
 * Parse a typed input. Accepts a full rebind value ("js2_button3", "kb1_lalt+n") or a bare input ("lalt+n", "button3").
 * Returns a rebind for the requested group, or an error message.
 */
export function parseManual(text: string, group: Group, instance = 1): { rebind?: Rebind; error?: string; warning?: string } {
  const raw = text.trim().toLowerCase();
  if (!raw) return { error: 'Type an input name' };
  let slot: Slot = group === 'km' ? 'kb' : group;
  let inst = instance;
  let input = raw;
  const p = parseRebindInput(raw);
  if (p) {
    const g: Group = p.slot === 'js' ? 'js' : p.slot === 'gp' ? 'gp' : 'km';
    if (g !== group) return { error: `"${raw}" is a ${g === 'km' ? 'keyboard/mouse' : g === 'js' ? 'joystick' : 'gamepad'} input` };
    slot = p.slot; inst = p.instance; input = p.input;
  }
  input = input.replace(/\s+/g, '');
  const t = tokens(input);
  if (!t.length) return { error: 'Empty input' };
  const re = group === 'km' ? KM_TOKEN : group === 'js' ? JS_TOKEN : GP_TOKEN;
  const unknown = t.filter((x) => !re.test(x) && !(group === 'km' && isModifier(x)));
  const known = group !== 'km' || t.every((x) => isModifier(x) || ALL_SC_KEYS.includes(x) || /^(mouse\d|mwheel_|maxis_)/.test(x));
  return {
    rebind: { slot, instance: slot === 'kb' || slot === 'mo' ? 1 : Math.max(1, inst), input: group === 'km' ? normalizeKm(t) : t.join('+') },
    warning: unknown.length || !known ? `"${unknown.join(', ') || t.join('+')}" isn't a name the game normally uses; double-check it` : undefined,
  };
}
const normalizeKm = (t: string[]) => { const mods = t.filter(isModifier); return [...mods, ...t.filter((x) => !isModifier(x))].join('+'); };

/* -------------------------------------------------- joystick product strings */
/** Vendor/product ids from a Gamepad.id ("Name (Vendor: 231d Product: 0200)" in Chrome, "231d-0200-Name" in Firefox) */
export function parsePadId(id: string): { name: string; vendor?: string; product?: string } {
  let m = /^(.*?)\s*\((?:.*?)Vendor:\s*([0-9a-f]{4})\s+Product:\s*([0-9a-f]{4})\)\s*$/i.exec(id);
  if (m) return { name: m[1].trim(), vendor: m[2].toUpperCase(), product: m[3].toUpperCase() };
  m = /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-(.*)$/i.exec(id);
  if (m) return { name: m[3].trim(), vendor: m[1].padStart(4, '0').toUpperCase(), product: m[2].padStart(4, '0').toUpperCase() };
  return { name: id.replace(/\s*\(.*\)\s*$/, '').trim() || id };
}
/** The Product string the game writes in <options>: DirectInput name + product GUID {PIDVID-0000-0000-0000-504944564944} */
export function productString(id: string): string {
  const p = parsePadId(id);
  return p.vendor && p.product ? ` ${p.name}    {${p.product}${p.vendor}-0000-0000-0000-504944564944}` : p.name;
}
export const KEYBOARD_PRODUCT = 'Keyboard  {6F1D2B61-D5A0-11CF-BFC7-444553540000}';

export const comboKey = (s: string) => normalizeCombo(s);
