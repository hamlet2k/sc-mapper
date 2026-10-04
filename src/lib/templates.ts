// Device templates: an image of a controller with callouts (input -> anchor point on the image + label position), linked to
// devices by USB vendor/product id, name and button count. Coordinates are fractions (0..1) of the image width/height.
import { useCallback, useEffect, useState } from 'react';
import { GP_AXES, GP_BUTTONS, JS_AXES } from './capture';
import { BUILTIN_TEMPLATES } from './builtinTemplates';

export type CalloutKind = 'button' | 'hat' | 'axis' | 'encoder' | 'switch';
export const CALLOUT_KINDS: { kind: CalloutKind; label: string; hint: string }[] = [
  { kind: 'button', label: 'Button', hint: 'one button' },
  { kind: 'hat', label: 'Hat (5-way)', hint: 'up / right / down / left, optional push button' },
  { kind: 'axis', label: 'Axis', hint: 'one axis, or two for a mini-stick' },
  { kind: 'encoder', label: 'Encoder pair', hint: 'two buttons: clockwise, counter-clockwise' },
  { kind: 'switch', label: 'Multi-position switch', hint: 'one button per position' },
];
export interface Pt { x: number; y: number }
export interface Callout {
  id: string;
  kind: CalloutKind;
  /** game input names (no js1_ prefix): button: [button3]; hat: [hat1_up, hat1_right, hat1_down, hat1_left, (push)]; axis: [x] or [x, y];
   * encoder: [cw, ccw]; switch: one per position */
  inputs: string[];
  label?: string;
  group?: string;
  /** point on the device the leader line starts from */
  anchor: Pt;
  /** centre of the label box */
  box: Pt;
}
export interface TemplateMatch {
  /** USB vendor / product id, 4 hex digits */
  vendor?: string; product?: string;
  /** part of the device name (case and punctuation ignored) */
  name?: string;
  /** exact button count: tells apart devices sharing one USB id (e.g. two MOZA bases with 128 and 133 buttons) */
  buttons?: number;
}
export interface DeviceTemplate {
  format?: 'sc-mapper-device-template';
  version: 1;
  id: string;
  name: string;
  builtin?: boolean;
  slot: 'js' | 'gp';
  /** data: URL (png / jpeg / webp / svg) or none for a blank canvas */
  image?: string;
  /** width / height of the canvas */
  aspect: number;
  match: TemplateMatch[];
  callouts: Callout[];
  updatedAt?: number;
}
export interface DeviceIdentity { name?: string; vendor?: string; productId?: string; buttons?: number; slot?: 'js' | 'gp' }

export const MAX_IMAGE_BYTES = 2_500_000;
export const MAX_IMAGE_SIDE = 1600;
export const BLANK_ASPECT = 1.6;

export const uid = () => Math.random().toString(36).slice(2, 10);
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
const hex4 = (s?: string) => (s ? s.replace(/^0x/i, '').toUpperCase().padStart(4, '0').slice(-4) : undefined);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/* ------------------------------------------------------------- inputs */
export const HAT_DIRS = ['up', 'right', 'down', 'left'] as const;
export const hatInputs = (n: number) => HAT_DIRS.map((d) => `hat${n}_${d}`);
const HAT_RE = /^hat(\d)_(up|down|left|right)$/;
const DPAD_RE = /^dpad_(up|down|left|right)$/;
export const isAxisInput = (i: string) => JS_AXES.includes(i) || GP_AXES.includes(i) || i === 'triggerl' || i === 'triggerr';

/** callout kind and inputs for a pressed input */
export function calloutFor(input: string): { kind: CalloutKind; inputs: string[] } {
  const h = HAT_RE.exec(input);
  if (h) return { kind: 'hat', inputs: hatInputs(Number(h[1])) };
  if (DPAD_RE.test(input)) return { kind: 'hat', inputs: HAT_DIRS.map((d) => `dpad_${d}`) };
  if (isAxisInput(input)) {
    const pair = { thumblx: 'thumbly', thumbly: 'thumblx', thumbrx: 'thumbry', thumbry: 'thumbrx' } as Record<string, string>;
    return { kind: 'axis', inputs: pair[input] ? [input.endsWith('x') ? input : pair[input], input.endsWith('x') ? pair[input] : input] : [input] };
  }
  return { kind: 'button', inputs: [input] };
}

/** inputs a callout should have when its kind changes (keeps what still fits) */
export function inputsForKind(kind: CalloutKind, prev: string[], slot: 'js' | 'gp', used: Set<string>): string[] {
  const btns = prev.filter((i) => !isAxisInput(i) && !HAT_RE.test(i));
  const nextBtn = () => nextFreeButton(slot, used, btns);
  if (kind === 'button') return [btns[0] ?? nextBtn()];
  if (kind === 'hat') {
    const h = prev.map((i) => HAT_RE.exec(i)).find(Boolean);
    if (slot === 'gp') return HAT_DIRS.map((d) => `dpad_${d}`);
    return hatInputs(h ? Number(h[1]) : nextFreeHat(used));
  }
  if (kind === 'axis') return [prev.find(isAxisInput) ?? (slot === 'gp' ? 'thumblx' : JS_AXES.find((a) => !used.has(a)) ?? 'x')];
  if (kind === 'encoder') { const a = btns[0] ?? nextBtn(); const b = btns[1] ?? nextFreeButton(slot, used, [a]); return [a, b]; }
  const a = btns[0] ?? nextBtn(); const b = btns[1] ?? nextFreeButton(slot, used, [a]); const c = btns[2] ?? nextFreeButton(slot, used, [a, b]);
  return btns.length > 3 ? btns : [a, b, c];
}
export function nextFreeButton(slot: 'js' | 'gp', used: Set<string>, also: string[] = []): string {
  if (slot === 'gp') return GP_BUTTONS.find((b) => !used.has(b) && !also.includes(b)) ?? GP_BUTTONS[0];
  for (let n = 1; n <= 128; n++) { const b = `button${n}`; if (!used.has(b) && !also.includes(b)) return b; }
  return 'button1';
}
const nextFreeHat = (used: Set<string>) => { for (let n = 1; n <= 4; n++) if (!used.has(`hat${n}_up`)) return n; return 1; };
export const usedInputs = (t: Pick<DeviceTemplate, 'callouts'>) => new Set(t.callouts.flatMap((c) => c.inputs));

const AXIS_SHORT: Record<string, string> = { x: 'X', y: 'Y', z: 'Z', rotx: 'RX', roty: 'RY', rotz: 'RZ', slider1: 'S1', slider2: 'S2', thumblx: 'LX', thumbly: 'LY', thumbrx: 'RX', thumbry: 'RY', triggerl: 'LT', triggerr: 'RT' };
const ARROW: Record<string, string> = { up: '↑', right: '→', down: '↓', left: '←' };
/** compact name for an input: button12 -> 12, hat1_up -> H1↑, rotz -> RZ */
export function shortInput(i: string): string {
  let m = /^button(\d+)$/.exec(i);
  if (m) return m[1];
  m = HAT_RE.exec(i);
  if (m) return `H${m[1]}${ARROW[m[2]]}`;
  m = DPAD_RE.exec(i);
  if (m) return `D${ARROW[m[1]]}`;
  return AXIS_SHORT[i] ?? i;
}
/** callout title: its label, else its inputs ("B3", "H1", "X/Y", "B5/B6") */
export function calloutTitle(c: Callout): string {
  if (c.label) return c.label;
  if (c.kind === 'hat') { const m = HAT_RE.exec(c.inputs[0] ?? ''); return m ? `Hat ${m[1]}` : DPAD_RE.test(c.inputs[0] ?? '') ? 'D-pad' : 'Hat'; }
  if (c.kind === 'axis') return c.inputs.map(shortInput).join('/');
  return c.inputs.map((i) => (/^button\d+$/.test(i) ? `B${shortInput(i)}` : shortInput(i))).join('/');
}
/** role of each input of a callout, for display */
export function inputRole(c: Callout, idx: number): string {
  if (c.kind === 'hat') return idx < 4 ? ARROW[HAT_DIRS[idx]] : '●';
  if (c.kind === 'encoder') return idx === 0 ? '⟳' : '⟲';
  if (c.kind === 'switch') return `P${idx + 1}`;
  return '';
}

/* ------------------------------------------------------------- matching */
/** how well a template's match rules fit a device: 0 = no match. USB id +10, name +5, exact button count +3. */
export function matchScore(t: Pick<DeviceTemplate, 'match' | 'slot'>, d: DeviceIdentity): number {
  if (d.slot && t.slot !== d.slot) return 0;
  let best = 0;
  for (const m of t.match) {
    let s = 0, any = false, ok = true;
    if (m.vendor || m.product) {
      any = true;
      if ((!m.vendor || hex4(m.vendor) === hex4(d.vendor)) && (!m.product || hex4(m.product) === hex4(d.productId))) s += 10; else ok = false;
    }
    if (m.name) {
      any = true;
      const a = norm(m.name), b = norm(d.name ?? '');
      if (a && b.includes(a)) s += 5; else ok = false;
    }
    if (m.buttons) {
      any = true;
      if (d.buttons === m.buttons) s += 3; else ok = false;
    }
    if (any && ok && s > best) best = s;
  }
  return best;
}
/** generic built-in fallback for a device */
export function fallbackTemplate(d: DeviceIdentity, list: DeviceTemplate[] = BUILTIN_TEMPLATES): DeviceTemplate {
  const id = d.slot === 'gp' ? 'builtin-gamepad' : /throttle|twcs|tqs|quadrant|bravo|cm3|\bthr\b/i.test(d.name ?? '') ? 'builtin-throttle' : 'builtin-stick';
  return list.find((t) => t.id === id) ?? list[0];
}
/**
 * Template for a device: the user's pick for it, else the best-matching template (user templates win ties over built-ins),
 * else a generic built-in.
 */
export function pickTemplate(all: DeviceTemplate[], d: DeviceIdentity, chosenId?: string): { template: DeviceTemplate; how: 'chosen' | 'matched' | 'fallback'; score: number } {
  const chosen = chosenId ? all.find((t) => t.id === chosenId) : undefined;
  if (chosen) return { template: chosen, how: 'chosen', score: matchScore(chosen, d) };
  let best: DeviceTemplate | undefined, bs = 0;
  for (const t of all) {
    const s = matchScore(t, d) + (t.builtin ? 0 : 0.5);
    if (matchScore(t, d) > 0 && s > bs) { best = t; bs = s; }
  }
  if (best) return { template: best, how: 'matched', score: Math.floor(bs) };
  return { template: fallbackTemplate(d, all.filter((t) => t.builtin).length ? all.filter((t) => t.builtin) : BUILTIN_TEMPLATES), how: 'fallback', score: 0 };
}
/** key under which the user's template pick for a device is remembered: USB id + button count (or name) + game slot */
export const identityKey = (d: DeviceIdentity) =>
  `${d.slot ?? 'js'}|${d.vendor && d.productId ? `${hex4(d.vendor)}:${hex4(d.productId)}` : norm(d.name ?? '')}|${d.buttons ?? ''}`;

/** match rule for "link this template to that device" (button count only when it matters or is known) */
export const matchFor = (d: DeviceIdentity, withButtons: boolean): TemplateMatch => ({
  ...(d.vendor && d.productId ? { vendor: hex4(d.vendor), product: hex4(d.productId) } : d.name ? { name: d.name } : {}),
  ...(withButtons && d.buttons ? { buttons: d.buttons } : {}),
});

/* ------------------------------------------------------------- JSON */
export const TEMPLATE_FILE_FORMAT = 'sc-mapper-device-templates';
export function exportTemplates(list: DeviceTemplate[]): string {
  return JSON.stringify({ format: TEMPLATE_FILE_FORMAT, version: 1, templates: list.map(({ builtin: _b, ...t }) => ({ ...t, format: 'sc-mapper-device-template' })) }, null, 1);
}
const KINDS = new Set(CALLOUT_KINDS.map((k) => k.kind));
const INPUT_RE = /^[a-z][a-z0-9_]{0,24}$/;
function cleanTemplate(o: unknown, i: number): DeviceTemplate {
  if (!o || typeof o !== 'object') throw new Error(`Template ${i + 1} is not an object`);
  const t = o as Record<string, unknown>;
  if (typeof t.name !== 'string' || !t.name.trim()) throw new Error(`Template ${i + 1} has no name`);
  if (!Array.isArray(t.callouts)) throw new Error(`Template “${t.name}” has no callouts list`);
  let image: string | undefined;
  if (t.image !== undefined && t.image !== null && t.image !== '') {
    if (typeof t.image !== 'string' || !/^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/.test(t.image)) throw new Error(`Template “${t.name}”: the image must be an embedded data:image URL`);
    if (t.image.length > MAX_IMAGE_BYTES * 1.4) throw new Error(`Template “${t.name}”: the image is too large (max ${(MAX_IMAGE_BYTES / 1e6).toFixed(1)} MB)`);
    image = t.image;
  }
  const aspect = Number(t.aspect);
  const pt = (p: unknown): Pt => { const q = (p ?? {}) as Record<string, unknown>; return { x: clamp01(Number(q.x)), y: clamp01(Number(q.y)) }; };
  const callouts: Callout[] = (t.callouts as unknown[]).slice(0, 400).map((c, j) => {
    const q = (c ?? {}) as Record<string, unknown>;
    const kind = KINDS.has(q.kind as CalloutKind) ? (q.kind as CalloutKind) : 'button';
    const inputs = Array.isArray(q.inputs) ? q.inputs.filter((x): x is string => typeof x === 'string' && INPUT_RE.test(x)).slice(0, 12) : [];
    if (!inputs.length) throw new Error(`Template “${t.name}”: callout ${j + 1} has no valid input`);
    return {
      id: typeof q.id === 'string' && q.id ? q.id.slice(0, 40) : uid(), kind, inputs,
      ...(typeof q.label === 'string' && q.label.trim() ? { label: q.label.trim().slice(0, 60) } : {}),
      ...(typeof q.group === 'string' && q.group.trim() ? { group: q.group.trim().slice(0, 40) } : {}),
      anchor: pt(q.anchor), box: pt(q.box ?? q.anchor),
    };
  });
  const match: TemplateMatch[] = (Array.isArray(t.match) ? t.match : []).slice(0, 20).map((m) => {
    const q = (m ?? {}) as Record<string, unknown>;
    const v = typeof q.vendor === 'string' && /^(0x)?[0-9a-f]{1,4}$/i.test(q.vendor) ? hex4(q.vendor) : undefined;
    const p = typeof q.product === 'string' && /^(0x)?[0-9a-f]{1,4}$/i.test(q.product) ? hex4(q.product) : undefined;
    const b = Number(q.buttons);
    return { ...(v ? { vendor: v } : {}), ...(p ? { product: p } : {}), ...(typeof q.name === 'string' && q.name.trim() ? { name: q.name.trim().slice(0, 80) } : {}), ...(Number.isInteger(b) && b > 0 && b < 1000 ? { buttons: b } : {}) };
  }).filter((m) => Object.keys(m).length);
  return {
    version: 1, id: typeof t.id === 'string' && t.id && !t.id.startsWith('builtin-') ? t.id.slice(0, 40) : uid(), name: t.name.trim().slice(0, 80),
    slot: t.slot === 'gp' ? 'gp' : 'js', ...(image ? { image } : {}), aspect: Number.isFinite(aspect) && aspect > 0.2 && aspect < 5 ? aspect : BLANK_ASPECT,
    match, callouts, updatedAt: Number(t.updatedAt) || Date.now(),
  };
}
/** parse a template file: {format, templates:[...]}, a bare template or an array of templates */
export function parseTemplates(text: string): DeviceTemplate[] {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new Error('Not a JSON file'); }
  const list = Array.isArray(o) ? o : o && typeof o === 'object' && Array.isArray((o as { templates?: unknown }).templates) ? (o as { templates: unknown[] }).templates : [o];
  if (!list.length) throw new Error('No templates in this file');
  return list.slice(0, 50).map(cleanTemplate);
}

/* ------------------------------------------------------------- images */
/** size to scale an image down to so its longest side is at most `max` */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_SIDE): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/** approximate decoded size in bytes of a base64 data URL */
export const dataUrlBytes = (u: string) => { const i = u.indexOf(','); return i < 0 ? u.length : u.startsWith('data:', 0) && u.slice(0, i).includes(';base64') ? Math.floor(((u.length - i - 1) * 3) / 4) : u.length - i - 1; };

/** read an uploaded image, scale it down (max 1600 px) and re-encode it (WebP, else JPEG/PNG) until it fits MAX_IMAGE_BYTES */
export async function loadImageFile(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (PNG, JPEG, WebP, SVG)');
  const src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); });
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The browser could not decode this image')); i.src = src; });
  const w0 = img.naturalWidth || 1000, h0 = img.naturalHeight || 625;
  if (file.type === 'image/svg+xml' && src.length <= MAX_IMAGE_BYTES) return { dataUrl: src, w: w0, h: h0 };
  let side = Math.min(MAX_IMAGE_SIDE, Math.max(w0, h0));
  for (let attempt = 0; attempt < 6; attempt++) {
    const { w, h } = fitWithin(w0, h0, side);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    let url = c.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) { url = c.toDataURL('image/png'); if (dataUrlBytes(url) > MAX_IMAGE_BYTES) url = c.toDataURL('image/jpeg', 0.85); }
    if (dataUrlBytes(url) <= MAX_IMAGE_BYTES) return { dataUrl: url, w, h };
    side = Math.round(side * 0.75);
  }
  throw new Error('This image is too large even after shrinking it');
}

/* ------------------------------------------------------------- storage */
const DB = 'sc-mapper-templates', STORE = 'templates', LS = 'sc-mapper:templates', PICKS = 'sc-mapper:template-picks';
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined') return res(null);
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function dbAll(): Promise<DeviceTemplate[]> {
  const db = await openDb();
  if (!db) { try { return JSON.parse(localStorage.getItem(LS) ?? '[]'); } catch { return []; } }
  return new Promise((res) => { const q = db.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => res(q.result as DeviceTemplate[]); q.onerror = () => res([]); });
}
async function dbWrite(fn: (s: IDBObjectStore) => void, fallback: (l: DeviceTemplate[]) => DeviceTemplate[]): Promise<void> {
  const db = await openDb();
  if (!db) {
    let l: DeviceTemplate[] = [];
    try { l = JSON.parse(localStorage.getItem(LS) ?? '[]'); } catch { /* empty */ }
    localStorage.setItem(LS, JSON.stringify(fallback(l)));
    return;
  }
  await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); fn(tx.objectStore(STORE)); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error ?? new Error('Could not save the template')); });
}
export const loadPicks = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(PICKS) ?? '{}'); } catch { return {}; } };

/** user templates (IndexedDB, localStorage fallback) plus the built-ins, and the user's template pick per device */
export function useTemplates() {
  const [user, setUser] = useState<DeviceTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>(() => loadPicks());
  useEffect(() => { let on = true; dbAll().then((l) => { if (on) { setUser(l.sort((a, b) => a.name.localeCompare(b.name))); setLoaded(true); } }); return () => { on = false; }; }, []);
  const save = useCallback(async (t: DeviceTemplate) => {
    const v = { ...t, builtin: undefined, updatedAt: Date.now() };
    delete v.builtin;
    await dbWrite((s) => s.put(v), (l) => [...l.filter((x) => x.id !== v.id), v]);
    setUser((l) => [...l.filter((x) => x.id !== v.id), v].sort((a, b) => a.name.localeCompare(b.name)));
    return v;
  }, []);
  const remove = useCallback(async (id: string) => {
    await dbWrite((s) => s.delete(id), (l) => l.filter((x) => x.id !== id));
    setUser((l) => l.filter((x) => x.id !== id));
  }, []);
  const pick = useCallback((key: string, id: string | null) => setPicks((p) => {
    const n = { ...p };
    if (id) n[key] = id; else delete n[key];
    localStorage.setItem(PICKS, JSON.stringify(n));
    return n;
  }), []);
  return { templates: [...user, ...BUILTIN_TEMPLATES], user, loaded, save, remove, picks, pick };
}

/** a fresh template (blank canvas unless an image is given) */
export const newTemplate = (slot: 'js' | 'gp', name = 'My device'): DeviceTemplate => ({ version: 1, id: uid(), name, slot, aspect: BLANK_ASPECT, match: [], callouts: [] });
/** an editable copy of a template (built-ins are read-only) */
export const cloneTemplate = (t: DeviceTemplate, name = `${t.name} (copy)`): DeviceTemplate => ({ ...structuredClone({ ...t, builtin: undefined }), id: uid(), name, builtin: undefined });

/** where the label for a new callout goes: free slots down the left and right edges, nearest side first */
export function freeBoxSpot(t: Pick<DeviceTemplate, 'callouts'>, anchor: Pt): Pt {
  const xs = anchor.x < 0.5 ? [0.1, 0.9] : [0.9, 0.1];
  for (const x of xs) for (let k = 0; k < 9; k++) {
    const y = 0.07 + k * 0.107;
    if (!t.callouts.some((c) => Math.abs(c.box.x - x) < 0.12 && Math.abs(c.box.y - y) < 0.09)) return { x, y };
  }
  return { x: clamp01(anchor.x + 0.12), y: clamp01(anchor.y - 0.08) };
}

/* ------------------------------------------------------------- live state */
/**
 * Inputs currently active on a device: held buttons, hats pushed (diagonals light both directions), axes moved away from where
 * they rest (by more than `axisDelta`), and every axis value by game name.
 */
export function liveInputs(kind: 'js' | 'gp', state: { buttons: boolean[]; axes: number[] }, rest: number[], axisDelta = 0.2): { active: Set<string>; values: Record<string, number> } {
  const active = new Set<string>();
  const values: Record<string, number> = {};
  state.buttons.forEach((p, i) => { if (p) active.add(kind === 'gp' ? GP_BUTTONS[i] ?? `button${i + 1}` : `button${i + 1}`); });
  if (kind === 'gp') {
    state.axes.forEach((v, i) => {
      const n = GP_AXES[i];
      if (!n) return;
      values[n] = v;
      if (Math.abs(v - (rest[i] ?? 0)) > axisDelta) active.add(n);
    });
    return { active, values };
  }
  let hat = 0;
  state.axes.forEach((v, i) => {
    const r = rest[i] ?? 0;
    if (Math.abs(r) > 1.05) {
      hat++;
      if (Math.abs(v) <= 1.05) {
        const k = Math.max(0, Math.min(7, Math.round(((v + 1) / 2) * 7)));
        const d = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'][k];
        for (const part of d.split('-')) active.add(`hat${hat}_${part}`);
      }
      return;
    }
    const n = JS_AXES[i]; // same index-based names as capture
    if (!n) return;
    values[n] = v;
    if (Math.abs(v - r) > axisDelta) active.add(n);
  });
  return { active, values };
}

/* ------------------------------------------------------------- bindings */
const DERIVED: Record<string, string[]> = {
  thumblx: ['thumbl_left', 'thumbl_right'], thumbly: ['thumbl_up', 'thumbl_down'], thumbrx: ['thumbr_left', 'thumbr_right'], thumbry: ['thumbr_up', 'thumbr_down'],
  triggerl_btn: ['triggerl'], triggerr_btn: ['triggerr'],
};
/** inputs whose bindings show on a callout: its own plus directions of a gamepad stick / analog trigger */
export const coveredInputs = (c: Pick<Callout, 'inputs'>) => [...c.inputs, ...c.inputs.flatMap((i) => DERIVED[i] ?? [])];
/** the physical input a binding fires on (last non-modifier token) and what has to be held with it */
export function splitCombo(input: string): { main: string; prefix: string } {
  const t = input.toLowerCase().split('+').map((x) => x.trim()).filter(Boolean);
  const mods = t.filter((x) => /^(l|r)(alt|ctrl|shift)$/.test(x));
  const rest = t.filter((x) => !mods.includes(x));
  const main = rest[rest.length - 1] ?? t[t.length - 1] ?? '';
  return { main, prefix: [...mods, ...rest.slice(0, -1)].join('+') };
}
