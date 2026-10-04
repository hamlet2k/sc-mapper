// Generic built-in device templates, drawn here as simple SVG (no vendor artwork). Canvas 1000 x 625.
import type { Callout, CalloutKind, DeviceTemplate } from './templates';

const W = 1000, H = 625;
const svgUrl = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke="#7fa6c2" stroke-width="3" stroke-linejoin="round">${body}</svg>`)}`;
const fill = 'fill="#0f2235"';
const cross = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" ${fill}/><path d="M${x} ${y - r + 5}v${2 * r - 10}M${x - r + 5} ${y}h${2 * r - 10}" stroke-width="2"/>`;
const btn = (x: number, y: number, r = 11) => `<circle cx="${x}" cy="${y}" r="${r}" ${fill}/>`;

/** callout from pixel coordinates on the 1000 x 625 canvas */
const c = (id: string, kind: CalloutKind, inputs: string[], ax: number, ay: number, bx: number, by: number, label?: string, group?: string): Callout => ({
  id, kind, inputs, anchor: { x: ax / W, y: ay / H }, box: { x: bx, y: by }, ...(label ? { label } : {}), ...(group ? { group } : {}),
});
const hat = (n: number) => ['up', 'right', 'down', 'left'].map((d) => `hat${n}_${d}`);

const STICK = svgUrl([
  '<rect x="370" y="520" width="260" height="80" rx="18" fill="#0b1a2a"/>',
  '<rect x="484" y="395" width="32" height="128" rx="6" fill="#0b1a2a"/>',
  '<path d="M432 405 Q418 300 428 210 Q436 120 470 96 Q520 74 560 100 Q590 124 580 220 Q574 320 568 405 Z" fill="#0b1a2a"/>',
  '<path d="M424 222 q-22 6 -18 36 q4 22 22 20" fill="#0f2235"/>',
  cross(470, 150, 22), cross(530, 185, 16), btn(556, 124, 10), btn(520, 228), btn(546, 272), btn(442, 330, 9),
  btn(420, 560), btn(580, 560), '<rect x="596" y="574" width="26" height="14" rx="4" fill="#0f2235"/>',
  '<path d="M455 470 h-30 m0 0 l10 -8 m-10 8 l10 8 M545 470 h30 m0 0 l-10 -8 m10 8 l-10 8" stroke-width="2"/>',
  '<path d="M560 330 q24 -20 10 -50" stroke-width="2"/><path d="M570 280 l-10 2 m10 -2 l2 10" stroke-width="2"/>',
].join(''));

const THROTTLE = svgUrl([
  '<rect x="290" y="470" width="420" height="130" rx="20" fill="#0b1a2a"/>',
  '<path d="M486 470 L470 290 L530 290 L540 470 Z" fill="#0b1a2a"/>',
  '<rect x="370" y="130" width="250" height="160" rx="40" fill="#0b1a2a"/>',
  cross(430, 170, 20), cross(510, 155, 18), '<circle cx="578" cy="196" r="17" fill="#0f2235"/><circle cx="578" cy="196" r="6"/>',
  btn(455, 228), btn(395, 250, 10), '<rect x="526" y="236" width="34" height="18" rx="9" fill="#0f2235"/>',
  '<rect x="630" y="492" width="20" height="60" rx="6" fill="#0f2235"/>', '<rect x="636" y="500" width="8" height="18" rx="3" fill="#7fa6c2"/>',
  '<rect x="350" y="530" width="20" height="34" rx="5" fill="#0f2235"/>', '<path d="M360 530 v-14" stroke-width="5"/>', btn(560, 545, 12),
  '<path d="M505 330 v60 m0 -60 l-8 10 m8 -10 l8 10 m-8 50 l-8 -10 m8 10 l8 -10" stroke-width="2"/>',
].join(''));

const GAMEPAD = svgUrl([
  '<path d="M300 205 Q500 170 700 205 Q790 220 815 330 Q840 470 770 500 Q720 515 680 450 L640 410 L360 410 L320 450 Q280 515 230 500 Q160 470 185 330 Q210 220 300 205 Z" fill="#0b1a2a"/>',
  '<rect x="262" y="150" width="76" height="28" rx="12" fill="#0f2235"/><rect x="662" y="150" width="76" height="28" rx="12" fill="#0f2235"/>',
  '<rect x="258" y="190" width="84" height="18" rx="8" fill="#0f2235"/><rect x="658" y="190" width="84" height="18" rx="8" fill="#0f2235"/>',
  '<circle cx="310" cy="285" r="34" fill="#0f2235"/><circle cx="310" cy="285" r="20"/>',
  '<circle cx="610" cy="380" r="34" fill="#0f2235"/><circle cx="610" cy="380" r="20"/>',
  '<path d="M378 352 h24 v24 h24 v24 h-24 v24 h-24 v-24 h-24 v-24 h24 z" fill="#0f2235"/>',
  btn(690, 245, 15), btn(730, 285, 15), btn(690, 325, 15), btn(650, 285, 15),
  '<rect x="440" y="275" width="30" height="16" rx="8" fill="#0f2235"/><rect x="530" y="275" width="30" height="16" rx="8" fill="#0f2235"/>',
].join(''));

export const BUILTIN_TEMPLATES: DeviceTemplate[] = [
  {
    version: 1, id: 'builtin-stick', name: 'Generic stick', builtin: true, slot: 'js', image: STICK, aspect: W / H, match: [],
    callouts: [
      c('hat1', 'hat', hat(1), 470, 150, 0.13, 0.1, undefined, 'Grip'),
      c('b2', 'button', ['button2'], 556, 124, 0.86, 0.1, undefined, 'Grip'),
      c('hat2', 'hat', hat(2), 530, 185, 0.86, 0.25, undefined, 'Grip'),
      c('b1', 'button', ['button1'], 412, 246, 0.13, 0.3, 'Trigger', 'Grip'),
      c('b3', 'button', ['button3'], 520, 228, 0.86, 0.39, undefined, 'Grip'),
      c('b4', 'button', ['button4'], 546, 272, 0.86, 0.5, undefined, 'Grip'),
      c('b5', 'button', ['button5'], 442, 330, 0.13, 0.48, 'Pinky', 'Grip'),
      c('xy', 'axis', ['x', 'y'], 500, 470, 0.13, 0.66, 'Stick X / Y', 'Axes'),
      c('rz', 'axis', ['rotz'], 568, 300, 0.86, 0.62, 'Twist', 'Axes'),
      c('b6', 'button', ['button6'], 420, 560, 0.13, 0.84, undefined, 'Base'),
      c('b7', 'button', ['button7'], 580, 560, 0.86, 0.76, undefined, 'Base'),
      c('s1', 'axis', ['slider1'], 609, 581, 0.86, 0.9, 'Base slider', 'Axes'),
    ],
  },
  {
    version: 1, id: 'builtin-throttle', name: 'Generic throttle', builtin: true, slot: 'js', image: THROTTLE, aspect: W / H, match: [],
    callouts: [
      c('hat1', 'hat', hat(1), 430, 170, 0.13, 0.1, undefined, 'Handle'),
      c('hat2', 'hat', hat(2), 510, 155, 0.86, 0.1, undefined, 'Handle'),
      c('ms', 'axis', ['rotx', 'roty'], 578, 196, 0.86, 0.26, 'Mini-stick', 'Handle'),
      c('b1', 'button', ['button1'], 455, 228, 0.13, 0.28, undefined, 'Handle'),
      c('b4', 'button', ['button4'], 395, 250, 0.13, 0.42, undefined, 'Handle'),
      c('enc', 'encoder', ['button2', 'button3'], 543, 245, 0.86, 0.42, 'Encoder', 'Handle'),
      c('z', 'axis', ['z'], 505, 360, 0.13, 0.6, 'Throttle', 'Axes'),
      c('s1', 'axis', ['slider1'], 640, 510, 0.86, 0.6, 'Base slider', 'Axes'),
      c('sw', 'switch', ['button5', 'button6', 'button7'], 360, 540, 0.13, 0.82, '3-way switch', 'Base'),
      c('b8', 'button', ['button8'], 560, 545, 0.86, 0.8, undefined, 'Base'),
    ],
  },
  {
    version: 1, id: 'builtin-gamepad', name: 'Gamepad', builtin: true, slot: 'gp', image: GAMEPAD, aspect: W / H, match: [],
    callouts: [
      c('lt', 'button', ['triggerl_btn'], 300, 162, 0.1, 0.08, 'LT', 'Left'),
      c('lb', 'button', ['shoulderl'], 300, 199, 0.1, 0.2, 'LB', 'Left'),
      c('ls', 'axis', ['thumblx', 'thumbly'], 300, 280, 0.1, 0.33, 'Left stick', 'Left'),
      c('l3', 'button', ['thumbl'], 318, 292, 0.1, 0.46, 'L3 (press)', 'Left'),
      c('dpad', 'hat', ['dpad_up', 'dpad_right', 'dpad_down', 'dpad_left'], 390, 388, 0.1, 0.63, 'D-pad', 'Left'),
      c('back', 'button', ['back'], 455, 283, 0.32, 0.92, 'Back / View'),
      c('start', 'button', ['start'], 545, 283, 0.66, 0.92, 'Start / Menu'),
      c('rt', 'button', ['triggerr_btn'], 700, 162, 0.9, 0.08, 'RT', 'Right'),
      c('rb', 'button', ['shoulderr'], 700, 199, 0.9, 0.2, 'RB', 'Right'),
      c('y', 'button', ['y'], 690, 245, 0.9, 0.32, 'Y', 'Right'),
      c('b', 'button', ['b'], 730, 285, 0.9, 0.43, 'B', 'Right'),
      c('a', 'button', ['a'], 690, 325, 0.9, 0.54, 'A', 'Right'),
      c('x', 'button', ['x'], 650, 285, 0.73, 0.66, 'X', 'Right'),
      c('rs', 'axis', ['thumbrx', 'thumbry'], 600, 372, 0.9, 0.7, 'Right stick', 'Right'),
      c('r3', 'button', ['thumbr'], 620, 392, 0.9, 0.82, 'R3 (press)', 'Right'),
    ],
  },
];
