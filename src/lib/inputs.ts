import type { Device, Group, Slot } from './types';

const MOUSE_RE = /^(mouse\d+(_\d+)?|mwheel_(up|down|left|right)|maxis_[xyz]{1,2})$/;
const MODIFIERS = ['lalt', 'ralt', 'lctrl', 'rctrl', 'lshift', 'rshift'];

export const isMouseToken = (t: string) => MOUSE_RE.test(t);
export const isModifier = (t: string) => MODIFIERS.includes(t);

/** Parse a rebind input like "kb1_lalt+f", "js2_button3", "mo1_mouse2", "gp1_ " */
export function parseRebindInput(raw: string): { slot: Slot; instance: number; input: string } | null {
  const m = /^(kb|mo|js|gp)(\d+)_(.*)$/s.exec(raw ?? '');
  if (!m) return null;
  return { slot: m[1] as Slot, instance: Number(m[2]) || 1, input: m[3].trim() };
}

export function tokens(input: string): string[] {
  return input.toLowerCase().split('+').map((t) => t.trim()).filter(Boolean);
}

/** Normalise a combo so modifier order doesn't matter */
export function normalizeCombo(input: string): string {
  const t = tokens(input);
  const mods = t.filter(isModifier).sort();
  const rest = t.filter((x) => !isModifier(x));
  return [...mods, ...rest].join('+');
}

export function devicesOf(slot: Slot, input: string): Device[] {
  if (slot === 'js') return ['joystick'];
  if (slot === 'gp') return ['gamepad'];
  const t = tokens(input);
  const hasMouse = t.some(isMouseToken);
  const hasKey = t.some((x) => !isMouseToken(x));
  const out: Device[] = [];
  if (hasKey && (slot === 'kb' || !hasMouse)) out.push('keyboard');
  if (hasMouse || slot === 'mo') out.push('mouse');
  return out.length ? out : [slot === 'mo' ? 'mouse' : 'keyboard'];
}

/** Which list column (device) a binding is shown in */
export function columnOfInput(slot: Slot, input: string): Device {
  if (slot === 'js') return 'joystick';
  if (slot === 'gp') return 'gamepad';
  return devicesOf(slot, input).includes('mouse') ? 'mouse' : 'keyboard';
}

export const groupOfSlot = (s: Slot): Group => (s === 'js' ? 'js' : s === 'gp' ? 'gp' : 'km');
export const GROUP_LABEL: Record<Group, string> = { km: 'Keyboard & Mouse', js: 'Joystick / HOTAS', gp: 'Gamepad' };
export const groupOfDevice = (d: Device): Group => (d === 'joystick' ? 'js' : d === 'gamepad' ? 'gp' : 'km');

/** Identity of an input within its rebind group (kb1_x and mo1_x are the same KeyboardMouse input; kb2 / mo2 are a second set) */
export function bindKey(slot: Slot, instance: number, input: string): string {
  return `${groupOfSlot(slot)}${instance || 1}:${normalizeCombo(input)}`;
}

/** Format a rebind input attribute value, e.g. kb1_lalt+n, js2_button3, gp1_ (cleared) */
export function formatInput(slot: Slot, instance: number, input: string): string {
  return `${slot}${instance || 1}_${input || ' '}`;
}

/** Exact search term for a binding: device prefix + instance + input ("js1_button5", "kb1_lalt+n", "mo1_mouse2") */
export function searchSpec(slot: Slot, instance: number, input: string): string {
  return `${slot}${instance || 1}_${normalizeCombo(input)}`;
}

export function physOf(slot: Slot, instance: number, input: string): string {
  const n = normalizeCombo(input);
  if (slot === 'kb' || slot === 'mo') return (instance || 1) > 1 ? `km${instance}:${n}` : `km:${n}`;
  if (slot === 'js') return `js${instance}:${n}`;
  return `gp${instance}:${n}`;
}

const KB: Record<string, string> = {
  lalt: 'L-Alt', ralt: 'R-Alt', lctrl: 'L-Ctrl', rctrl: 'R-Ctrl', lshift: 'L-Shift', rshift: 'R-Shift',
  space: 'Space', enter: 'Enter', escape: 'Esc', tab: 'Tab', backspace: 'Backspace', capslock: 'Caps',
  minus: '-', equals: '=', lbracket: '[', rbracket: ']', backslash: '\\', semicolon: ';', apostrophe: "'",
  comma: ',', period: '.', slash: '/', grave: '`', tilde: '`', lwin: 'Win', rwin: 'R-Win', apps: 'Menu', underline: '_', colon: ':', oem_102: '<>',
  insert: 'Ins', delete: 'Del', home: 'Home', end: 'End', pgup: 'PgUp', pgdn: 'PgDn',
  up: '↑', down: '↓', left: '←', right: '→', print: 'PrtSc', scrolllock: 'ScrLk', pause: 'Pause', numlock: 'NumLk',
  np_add: 'Num +', np_subtract: 'Num -', np_multiply: 'Num *', np_divide: 'Num /', np_period: 'Num .', np_enter: 'Num Enter',
  mouse1: 'LMB', mouse2: 'RMB', mouse3: 'MMB', mouse4: 'Mouse 4', mouse5: 'Mouse 5', mouse1_2: 'LMB+RMB', mwheel_up: 'Wheel ↑', mwheel_down: 'Wheel ↓',
  mwheel_left: 'Wheel ←', mwheel_right: 'Wheel →', maxis_x: 'Mouse X', maxis_y: 'Mouse Y', maxis_z: 'Mouse Z', maxis_xy: 'Mouse XY',
};
const GP: Record<string, string> = {
  a: 'A', b: 'B', x: 'X', y: 'Y', shoulderl: 'LB', shoulderr: 'RB', triggerl_btn: 'LT', triggerr_btn: 'RT',
  triggerl: 'LT axis', triggerr: 'RT axis', triggerl_r_btn: 'LT+RT', triggerr_l_btn: 'RT+LT', thumbl: 'LS click', thumbr: 'RS click', back: 'View', start: 'Menu',
  thumblx: 'LS X', thumbly: 'LS Y', thumblxy: 'LS XY', thumbrx: 'RS X', thumbry: 'RS Y', thumbrxy: 'RS XY',
  thumbl_up: 'LS ↑', thumbl_down: 'LS ↓', thumbl_left: 'LS ←', thumbl_right: 'LS →',
  thumbr_up: 'RS ↑', thumbr_down: 'RS ↓', thumbr_left: 'RS ←', thumbr_right: 'RS →',
  dpad_up: 'D-Pad ↑', dpad_down: 'D-Pad ↓', dpad_left: 'D-Pad ←', dpad_right: 'D-Pad →',
};
const DIR: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export function keyLabel(token: string, slot: Slot): string {
  const t = token.toLowerCase();
  if (slot === 'gp') return GP[t] ?? KB[t] ?? t.toUpperCase();
  if (slot === 'js') {
    let m;
    if ((m = /^button(\d+)$/.exec(t))) return `Btn ${m[1]}`;
    if ((m = /^hat(\d+)_(up|down|left|right)$/.exec(t))) return `Hat${m[1]} ${DIR[m[2]]}`;
    if ((m = /^slider(\d+)$/.exec(t))) return `Slider ${m[1]}`;
    if ((m = /^rot([xyz])$/.exec(t))) return `Rot ${m[1].toUpperCase()}`;
    if (t === 'throttlez') return 'Throttle Z';
    if (/^[xyz]$/.test(t)) return `${t.toUpperCase()} axis`;
    if (t === 'xy') return 'XY axis';
    return KB[t] ?? t;
  }
  if (KB[t]) return KB[t];
  let m;
  if ((m = /^np_(\d)$/.exec(t))) return `Num ${m[1]}`;
  if ((m = /^mouse(\d+)$/.exec(t))) return `Mouse ${m[1]}`;
  if (/^f\d{1,2}$/.test(t)) return t.toUpperCase();
  if (t.length === 1) return t.toUpperCase();
  return t.replace(/_/g, ' ');
}

export function comboLabel(input: string, slot: Slot): string {
  return tokens(normalizeCombo(input)).map((t) => keyLabel(t, slot)).join(' + ');
}

/** Extra searchable aliases for a token */
export function tokenAliases(t: string): string[] {
  const out = [t];
  if (t === 'lalt' || t === 'ralt') out.push('alt');
  if (t === 'lctrl' || t === 'rctrl') out.push('ctrl', 'control');
  if (t === 'lshift' || t === 'rshift') out.push('shift');
  if (t === 'mouse1') out.push('lmb', 'm1');
  if (t === 'mouse2') out.push('rmb', 'm2');
  if (t === 'mouse3') out.push('mmb', 'm3');
  if (/^mouse\d+$/.test(t)) out.push('m' + t.slice(5));
  if (t.startsWith('mwheel')) out.push('wheel', 'mwheel', 'scroll');
  if (t.startsWith('np_')) out.push('num' + t.slice(3), 'numpad', 'np');
  if (t === 'escape') out.push('esc');
  if (t === 'delete') out.push('del');
  if (t === 'insert') out.push('ins');
  let m;
  if ((m = /^button(\d+)$/.exec(t))) out.push('b' + m[1], 'btn' + m[1]);
  if ((m = /^hat(\d+)_/.exec(t))) out.push('hat' + m[1], 'hat');
  if (t.startsWith('dpad')) out.push('dpad');
  if (t === 'shoulderl') out.push('lb');
  if (t === 'shoulderr') out.push('rb');
  if (t === 'triggerl_btn') out.push('lt');
  if (t === 'triggerr_btn') out.push('rt');
  return out;
}

export const SLOT_DEVICE: Record<Slot, Device> = { kb: 'keyboard', mo: 'mouse', js: 'joystick', gp: 'gamepad' };
export const SLOT_TAG: Record<Slot, string> = { kb: 'KB', mo: 'MS', js: 'JS', gp: 'GP' };

export function prettyMode(mode?: string): string | undefined {
  if (!mode) return undefined;
  const map: Record<string, string> = {
    tap: 'Tap', press: 'Press', hold: 'Hold', all: 'Press/Hold', smart_toggle: 'Smart toggle', double_tap: 'Double tap',
    double_tap_nonblocking: 'Double tap', delayed_press: 'Long press', delayed_press_medium: 'Long press (0.5s)',
    delayed_press_long: 'Long press (1.5s)', delayed_hold: 'Delayed hold', delayed_hold_long: 'Delayed hold (1.5s)',
    delayed_hold_no_retrigger: 'Delayed hold', hold_toggle: 'Hold toggle', hold_no_retrigger: 'Hold',
    tap_quicker: 'Quick tap', press_quicker: 'Quick press',
  };
  return map[mode] ?? mode.replace(/_/g, ' ');
}
