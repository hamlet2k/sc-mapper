// One icon set for the whole app: thin futuristic line icons (24×24, 1.5 stroke, currentColor), no emoji.
import type { SVGProps } from 'react';

/** circle as a path */
const c = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
/** rounded rectangle as a path */
const rr = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

export const ICONS = {
  // ---- views / devices
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  keyboard: `${rr(2.5, 6, 19, 12, 2)}M6 9.5h1M9.5 9.5h1M13 9.5h1M16.5 9.5h1M6 12.5h1M17 12.5h1M9.5 12.5h4M8 15h8`,
  mouse: `${rr(6.5, 3, 11, 18, 5.5)}M12 3v6M6.5 9h11`,
  joystick: `M5 21h14a1.5 1.5 0 0 0 1.5-1.5V18A1.5 1.5 0 0 0 19 16.5H5A1.5 1.5 0 0 0 3.5 18v1.5A1.5 1.5 0 0 0 5 21zM12 16.5V9.5M7.5 16.5v-1.5${c(12, 6.5, 3)}`,
  gamepad: 'M7 9.5v4M5 11.5h4M15 11h.01M17.5 13h.01M7.2 5.5h9.6a4 4 0 0 1 3.9 3.2l1 5.6a3 3 0 0 1-5.1 2.6L15 15.3a2 2 0 0 0-1.4-.6h-3.2a2 2 0 0 0-1.4.6l-1.6 1.6a3 3 0 0 1-5.1-2.6l1-5.6a4 4 0 0 1 3.9-3.2z',
  devices: `${rr(3, 4, 18, 13, 1.5)}M8 21h8M12 17v4M8 12.5l2.5-2.5 2 2 3.5-3.5`,
  alert: 'M12 3.5l9.5 16.5h-19zM12 10v4.5M12 17.5h.01',
  // ---- actions
  search: `${c(10.5, 10.5, 6)}M15 15l5.5 5.5`,
  target: `${c(12, 12, 8)}${c(12, 12, 3)}M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22`,
  settings: `${c(12, 12, 3)}M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6${c(12, 12, 6.8)}`,
  help: `${c(12, 12, 9)}M9.6 9.3a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 17h.01`,
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  import: 'M12 15V3.5M7.5 8L12 3.5 16.5 8M4 14v5a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-5',
  export: 'M12 3.5V15M7.5 10.5L12 15l4.5-4.5M4 14v5a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-5',
  trash: 'M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6',
  close: 'M6 6l12 12M18 6L6 18',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  reset: 'M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4.5H8',
  refresh: 'M20 11.5A8 8 0 0 0 5.6 6.6L3.5 8.5M3.5 4v4.5H8M4 12.5a8 8 0 0 0 14.4 4.9l2.1-1.9M20.5 20v-4.5H16',
  plus: 'M12 5v14M5 12h14',
  copy: `${rr(8.5, 8.5, 12, 12, 1.5)}M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5`,
  move: 'M4 12h14M14 7l5 5-5 5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M4.5 12.5l5 5 10-11',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronUp: 'M6 15l6-6 6 6',
  curve: 'M3.5 3.5v17h17M6.5 17.5c4.5 0 6-11 11-11',
  slots: `${rr(3, 3, 18, 18, 2)}M3 9h18M3 15h18M9 3v18`,
  image: `${rr(3, 4.5, 18, 15, 1.5)}${c(8.5, 9.5, 1.5)}M21 15.5l-5-5-9.5 9`,
  print: `M7 8.5V3.5h10v5${rr(3, 8.5, 18, 8, 1.5)}M7 13.5h10v7H7z`,
  info: `${c(12, 12, 9)}M12 11v5.5M12 7.5h.01`,
  layers: 'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5',
  backspace: 'M8.5 5H20a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8.5L3 12zM11.5 9.5l5 5M16.5 9.5l-5 5',
  duplicate: `${rr(8.5, 8.5, 12, 12, 1.5)}M14.5 12v5M12 14.5h5M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5`,
  filePlus: 'M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5zM14 3.5v5h5M12 11.5v6M9 14.5h6',
  press: `${c(12, 12, 2.5)}M12 4.5a7.5 7.5 0 0 1 7.5 7.5M12 1.5A10.5 10.5 0 0 1 22.5 12M4.5 12A7.5 7.5 0 0 1 12 4.5`,
  plug: 'M9 3.5v4.5M15 3.5v4.5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5v4',
  filter: 'M3.5 5h17l-6.5 8v6l-4 1.5V13z',
  eye: `M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z${c(12, 12, 3)}`,
  dot: c(12, 12, 3),
  // ---- outside links (header): drawn here in the same line style, no vendor artwork
  coffee: 'M4.5 9.5h11.5v5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H15.5M3.5 21.5h14M8.5 2.5c-.9.75-.9 1.5 0 2.25s.9 1.5 0 2.25M12 2.5c-.9.75-.9 1.5 0 2.25s.9 1.5 0 2.25',
  github: 'M9 21.5v-2.6c0-.9.3-1.6.9-2.1-3-.4-5.9-1.6-5.9-6.3 0-1.3.5-2.5 1.3-3.4-.2-.8-.4-2.1.2-3.6 0 0 1.1-.3 3.6 1.3a12 12 0 0 1 5.8 0c2.5-1.6 3.6-1.3 3.6-1.3.6 1.5.4 2.8.2 3.6.8.9 1.3 2.1 1.3 3.4 0 4.7-2.9 5.9-5.9 6.3.6.5.9 1.3.9 2.3v2.4M9 19.3c-3 .9-3.6-1.6-5-2',
  feedback: 'M5 4h14a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 16h-8.5L6 20v-4H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 4zM12 7.5v4M12 13.5h.01',
  // ---- action-map categories (sidebar)
  flight: 'M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z',
  combat: 'M12 2v5M12 17v5M2 12h5M17 12h5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  industry: 'M4 20l7-7M14 4l6 6-3 3-6-6zM9 9l6 6',
  turret: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 12l6-6M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  fps: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 8v6M8 22l4-8 4 8M7 11h10',
  eva: 'M12 3a6 6 0 0 0-6 6v3a6 6 0 0 0 12 0V9a6 6 0 0 0-6-6zM8 9h8v3H8zM4 20h16',
  vehicle: 'M3 14l2-5h14l2 5v4H3zM7 18a2 2 0 1 0 0.1 0M17 18a2 2 0 1 0 0.1 0M6 9l1-3h10l1 3',
  social: 'M4 5h16v10H9l-5 4zM8 9h8M8 12h5',
  camera: 'M3 7h4l2-3h6l2 3h4v12H3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  internal: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  unlisted: 'M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V15M12 18v.5',
} as const;
export type IconName = keyof typeof ICONS;

/** <Ico name="keyboard" /> : sized by className (default 1em square, so it follows the text size) */
export function Ico({ name, className = '', strokeWidth = 1.5, ...rest }: { name: IconName | string; className?: string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  // Size defaults to the surrounding font size unless the caller sets a height/width.
  const sized = /(^|\s)(h|w|size)-/.test(className) ? '' : 'h-[1.1em] w-[1.1em] ';
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" className={`inline-block shrink-0 align-[-0.15em] ${sized}${className}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={(ICONS as Record<string, string>)[name] ?? ICONS.internal} />
    </svg>
  );
}
