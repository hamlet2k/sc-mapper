// Generic built-in device templates (no vendor artwork): original holographic wireframe drawings generated from small 3D models by
// scripts/gen-default-stick.mjs (1000 x 900), scripts/gen-default-throttle.mjs (1000 x 800) and scripts/gen-default-gamepad.mjs (1000 x 800).
import type { Callout, CalloutKind, DeviceTemplate } from './templates';
import { DEFAULT_GAMEPAD_ANCHORS, DEFAULT_GAMEPAD_H, DEFAULT_GAMEPAD_INPUT_REGIONS, DEFAULT_GAMEPAD_REGIONS, DEFAULT_GAMEPAD_SVG, DEFAULT_GAMEPAD_W } from './defaultGamepadArt';
import { DEFAULT_STICK_ANCHORS, DEFAULT_STICK_H, DEFAULT_STICK_REGIONS, DEFAULT_STICK_SVG, DEFAULT_STICK_W } from './defaultStickArt';
import { DEFAULT_THROTTLE_ANCHORS, DEFAULT_THROTTLE_H, DEFAULT_THROTTLE_INPUT_REGIONS, DEFAULT_THROTTLE_REGIONS, DEFAULT_THROTTLE_SVG, DEFAULT_THROTTLE_W } from './defaultThrottleArt';

const hat = (n: number) => ['up', 'right', 'down', 'left'].map((d) => `hat${n}_${d}`);

/* ------------------------------------------------ default stick: anchors and glow regions come from the generated art */
const DW = DEFAULT_STICK_W, DH = DEFAULT_STICK_H;
/** callout on the default stick: `art` names the control in the drawing; box = label centre (fractions) */
const d = (id: string, art: string, kind: CalloutKind, inputs: string[], bx: number, by: number, label?: string, group?: string): Callout => {
  const [ax, ay] = DEFAULT_STICK_ANCHORS[art];
  const region = DEFAULT_STICK_REGIONS[art];
  return { id, kind, inputs, anchor: { x: ax / DW, y: ay / DH }, box: { x: bx, y: by }, ...(label ? { label } : {}), ...(group ? { group } : {}), ...(region ? { region } : {}) };
};
/** callout on the default throttle art (same idea as `d`) */
const TW = DEFAULT_THROTTLE_W, TH = DEFAULT_THROTTLE_H;
const t = (id: string, art: string, kind: CalloutKind, inputs: string[], bx: number, by: number, label?: string, group?: string): Callout => {
  const [ax, ay] = DEFAULT_THROTTLE_ANCHORS[art];
  const region = DEFAULT_THROTTLE_REGIONS[art], inputRegions = DEFAULT_THROTTLE_INPUT_REGIONS[art];
  return { id, kind, inputs, anchor: { x: ax / TW, y: ay / TH }, box: { x: bx, y: by }, ...(label ? { label } : {}), ...(group ? { group } : {}), ...(region ? { region } : {}), ...(inputRegions ? { inputRegions } : {}) };
};
const b = (...n: number[]) => n.map((i) => `button${i}`);
const DEFAULT_THROTTLE: DeviceTemplate = {
  version: 1, id: 'builtin-throttle', name: 'Generic throttle', builtin: true, slot: 'js',
  image: `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_THROTTLE_SVG)}`, aspect: TW / TH, match: [],
  callouts: [
    // left column: left grip, left lever, panel (pilot side); ordered so that leader lines do not cross
    t('hat3', 'hat3', 'hat', [...hat(3), 'button10'], 0.125, 0.055, undefined, 'Left grip'),
    t('trgL', 'trgL', 'button', b(4), 0.115, 0.19, 'Left trigger', 'Left grip'),
    t('lz', 'lz', 'axis', ['z'], 0.115, 0.3, 'Left lever', 'Axes'),
    t('sld', 'sld', 'axis', ['slider2'], 0.115, 0.385, 'Slider', 'Axes'),
    t('mode', 'mode', 'switch', b(24, 25, 26, 27, 28), 0.115, 0.48, 'Mode 1 – 5', 'Panel'),
    t('keys', 'keys', 'buttons', b(11, 12, 13, 14, 15, 16), 0.115, 0.585, 'Keypad (lit)', 'Panel'),
    t('e1', 'e1', 'encoder', b(18, 19, 20), 0.115, 0.7, 'Encoder E1', 'Panel'),
    t('red', 'red', 'button', b(17), 0.115, 0.8, 'Emergency (guarded)', 'Panel'),
    // right column: right grip, right lever, flaps
    t('whl', 'whl', 'encoder', b(6, 7), 0.885, 0.055, 'Thumb wheel', 'Right grip'),
    t('hat1', 'hat1', 'hat', [...hat(1), 'button8'], 0.875, 0.165, undefined, 'Right grip'),
    t('ms', 'ms', 'axis', ['x', 'y'], 0.885, 0.3, 'Mini-stick', 'Right grip'),
    t('msb', 'ms', 'button', b(5), 0.885, 0.38, 'Mini-stick press', 'Right grip'),
    t('hat2', 'hat2', 'hat', [...hat(2), 'button9'], 0.875, 0.49, undefined, 'Right grip'),
    t('trgR', 'trgR', 'switch', b(1, 2), 0.885, 0.605, 'Trigger (2-stage)', 'Right grip'),
    t('gb1', 'gb1', 'button', b(3), 0.885, 0.685, 'Thumb button', 'Right grip'),
    t('lrz', 'lrz', 'axis', ['rotz'], 0.885, 0.76, 'Right lever', 'Axes'),
    t('flaps', 'flaps', 'axis', ['slider1'], 0.885, 0.835, 'Flaps lever', 'Axes'),
    t('e2', 'e2', 'encoder', b(21, 22, 23), 0.885, 0.91, 'Encoder E2', 'Panel'),
    // bottom row: toggles T1 – T3
    t('t1', 't1', 'switch', b(29, 30), 0.3, 0.915, 'Toggle T1 (on-off-on)', 'Panel'),
    t('t2', 't2', 'button', b(31), 0.5, 0.915, 'Toggle T2', 'Panel'),
    t('t3', 't3', 'button', b(32), 0.66, 0.915, 'Toggle T3', 'Panel'),
  ],
};

const DEFAULT_STICK: DeviceTemplate = {
  version: 1, id: 'builtin-stick', name: 'Generic stick', builtin: true, slot: 'js',
  image: `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_STICK_SVG)}`, aspect: DW / DH, match: [],
  callouts: [
    // left column, top to bottom (grip front / thumb side)
    d('hat1', 'hat1', 'hat', [...hat(1), 'button12'], 0.125, 0.06, undefined, 'Grip head'),
    d('enc', 'enc', 'encoder', ['button10', 'button11'], 0.115, 0.14, 'Thumb wheel', 'Grip head'),
    d('hat3', 'hat3', 'hat', [...hat(3), 'button14'], 0.125, 0.22, undefined, 'Grip head'),
    d('b8', 'b8', 'button', ['button8'], 0.115, 0.3, 'Index button', 'Grip head'),
    d('b6', 'b6', 'button', ['button6'], 0.115, 0.375, 'Thumb button (front)', 'Grip head'),
    d('hat4', 'hat4', 'hat', [...hat(4), 'button15'], 0.125, 0.45, undefined, 'Grip head'),
    d('trig', 'trig', 'switch', ['button1', 'button2'], 0.115, 0.55, 'Trigger (2-stage)', 'Grip'),
    d('b4', 'b4', 'button', ['button4'], 0.115, 0.66, 'Pinky paddle', 'Grip'),
    d('b5', 'b5', 'button', ['button5'], 0.115, 0.75, 'Pinky button', 'Grip'),
    d('rz', 'rz', 'axis', ['rotz'], 0.115, 0.825, 'Twist', 'Axes'),
    d('rowL', 'rowL', 'buttons', ['button16', 'button17', 'button18', 'button19'], 0.125, 0.915, 'Deck buttons (left)', 'Base'),
    // right column, top to bottom (top panel, base deck)
    d('ms', 'ms', 'axis', ['rotx', 'roty'], 0.885, 0.07, 'Mini-stick', 'Grip head'),
    d('msb', 'ms', 'button', ['button9'], 0.885, 0.175, 'Mini-stick press', 'Grip head'),
    d('b3', 'b3', 'button', ['button3'], 0.885, 0.255, 'Weapon release', 'Grip head'),
    d('hat2', 'hat2', 'hat', [...hat(2), 'button13'], 0.875, 0.345, undefined, 'Grip head'),
    d('b7', 'b7', 'button', ['button7'], 0.885, 0.44, 'Thumb button (rear)', 'Grip head'),
    d('rowR', 'rowR', 'buttons', ['button20', 'button21', 'button22', 'button23'], 0.875, 0.53, 'Deck buttons (right)', 'Base'),
    d('tog2', 'tog2', 'switch', ['button26', 'button27'], 0.885, 0.615, 'Toggle (right)', 'Base'),
    d('xy', 'xy', 'axis', ['x', 'y'], 0.885, 0.715, 'Stick X / Y', 'Axes'),
    d('fkeys', 'fkeys', 'buttons', ['button28', 'button29', 'button30'], 0.875, 0.825, 'F1 – F3', 'Base'),
    d('tog1', 'tog1', 'switch', ['button24', 'button25'], 0.885, 0.915, 'Toggle (left)', 'Base'),
    // bottom row: the three thumbwheels on the sloped pilot panel
    d('whl1', 'whl1', 'axis', ['slider1'], 0.33, 0.955, 'Lever wheel', 'Base'),
    d('whl2', 'whl2', 'axis', ['slider2'], 0.5, 0.955, 'Centre wheel', 'Base'),
    d('whl3', 'whl3', 'encoder', ['button31', 'button32'], 0.67, 0.955, 'Encoder EN1', 'Base'),
  ],
};

/* ------------------------------------------------ default gamepad (modern dual-stick layout), gp1_ names as in defaultProfile.xml */
const GW = DEFAULT_GAMEPAD_W, GH = DEFAULT_GAMEPAD_H;
const g = (id: string, art: string, kind: CalloutKind, inputs: string[], bx: number, by: number, label?: string, group?: string): Callout => {
  const [ax, ay] = DEFAULT_GAMEPAD_ANCHORS[art];
  const region = DEFAULT_GAMEPAD_REGIONS[art], inputRegions = id === art ? DEFAULT_GAMEPAD_INPUT_REGIONS[art] : undefined;
  return { id, kind, inputs, anchor: { x: ax / GW, y: ay / GH }, box: { x: bx, y: by }, ...(label ? { label } : {}), ...(group ? { group } : {}), ...(region ? { region } : {}), ...(inputRegions ? { inputRegions } : {}) };
};
const DEFAULT_GAMEPAD: DeviceTemplate = {
  version: 1, id: 'builtin-gamepad', name: 'Gamepad', builtin: true, slot: 'gp',
  image: `data:image/svg+xml;utf8,${encodeURIComponent(DEFAULT_GAMEPAD_SVG)}`, aspect: GW / GH, match: [],
  callouts: [
    // left column, top to bottom; the triggers also show bindings of the analog triggerl / triggerr axes
    g('lt', 'lt', 'button', ['triggerl_btn'], 0.115, 0.055, 'Left trigger (LT)', 'Left'),
    g('lb', 'lb', 'button', ['shoulderl'], 0.115, 0.16, 'Left bumper (LB)', 'Left'),
    g('ls', 'ls', 'axis', ['thumblx', 'thumbly'], 0.115, 0.31, 'Left stick', 'Left'),
    g('l3', 'ls', 'button', ['thumbl'], 0.115, 0.46, 'Left stick press', 'Left'),
    g('dpad', 'dpad', 'hat', ['dpad_up', 'dpad_right', 'dpad_down', 'dpad_left'], 0.125, 0.6, 'D-pad', 'Left'),
    // top centre
    g('back', 'back', 'button', ['back'], 0.4, 0.06, 'View', 'Centre'),
    g('start', 'start', 'button', ['start'], 0.6, 0.06, 'Menu', 'Centre'),
    // right column, top to bottom (the X line runs between Y and B); right stick below the picture
    g('rt', 'rt', 'button', ['triggerr_btn'], 0.885, 0.055, 'Right trigger (RT)', 'Right'),
    g('rb', 'rb', 'button', ['shoulderr'], 0.885, 0.16, 'Right bumper (RB)', 'Right'),
    g('y', 'y', 'button', ['y'], 0.885, 0.26, 'Y button', 'Face buttons'),
    g('x', 'x', 'button', ['x'], 0.885, 0.355, 'X button', 'Face buttons'),
    g('b', 'b', 'button', ['b'], 0.885, 0.455, 'B button', 'Face buttons'),
    g('a', 'a', 'button', ['a'], 0.885, 0.56, 'A button', 'Face buttons'),
    g('rs', 'rs', 'axis', ['thumbrx', 'thumbry'], 0.62, 0.895, 'Right stick', 'Right'),
    g('r3', 'rs', 'button', ['thumbr'], 0.885, 0.7, 'Right stick press', 'Right'),
  ],
};

export const BUILTIN_TEMPLATES: DeviceTemplate[] = [DEFAULT_STICK, DEFAULT_THROTTLE, DEFAULT_GAMEPAD];
