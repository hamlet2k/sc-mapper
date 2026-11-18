// WebHID fallback for controllers the Gamepad API never returns (Chromium caps a page at a handful of
// gamepads and 32 buttons). Firefox has no navigator.hid: every export here is a no-op there.
// Axis order matches Chrome on Windows so JS_AXES and hat detection in capture.ts keep working.

export interface HIDReportItem {
  isRange?: boolean;
  isConstant?: boolean;
  usages?: number[];
  usageMinimum?: number;
  usageMaximum?: number;
  reportSize?: number;
  reportCount?: number;
  logicalMinimum?: number;
  logicalMaximum?: number;
}

export interface HIDReportInfo {
  /** 0 (or omitted) means the report has no id byte. WebHID's inputreport `data` never includes that byte. */
  reportId?: number;
  items?: HIDReportItem[];
}

export interface HIDCollectionInfo {
  usagePage?: number;
  usage?: number;
  inputReports?: HIDReportInfo[];
  children?: HIDCollectionInfo[];
}

export interface HIDInputReportEvent {
  reportId: number;
  data: DataView;
  device: HIDDevice;
}

export interface HIDConnectionEvent { device: HIDDevice }

export interface HIDDevice {
  vendorId: number;
  productId: number;
  productName: string;
  collections: HIDCollectionInfo[];
  opened: boolean;
  open(): Promise<void>;
  addEventListener(type: 'inputreport', listener: (ev: HIDInputReportEvent) => void): void;
  removeEventListener(type: 'inputreport', listener: (ev: HIDInputReportEvent) => void): void;
}

interface HID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: { usagePage: number; usage: number }[] }): Promise<HIDDevice[]>;
  addEventListener(type: 'connect' | 'disconnect', listener: (ev: HIDConnectionEvent) => void): void;
  removeEventListener(type: 'connect' | 'disconnect', listener: (ev: HIDConnectionEvent) => void): void;
}

/** Joystick, Game Pad, Multi-axis Controller: the collections game controllers declare. */
const HID_FILTERS = [
  { usagePage: 0x01, usage: 0x04 },
  { usagePage: 0x01, usage: 0x05 },
  { usagePage: 0x01, usage: 0x08 },
];

/** Chrome's centred hat (9/7). isHatRest() is true; a position p in 0..7 is -1 + p*2/7. */
const HAT_REST = 9 / 7;
/** Above any Gamepad API index (Chromium stops well under this). Stable for one HIDDevice object for the session. */
const HID_INDEX_BASE = 1000;

export interface HidField {
  bitOffset: number;
  bitSize: number;
  logicalMin: number;
  logicalMax: number;
  kind: 'button' | 'axis' | 'hat';
  index: number;
}

export interface HidLayout {
  reports: Map<number, { fields: HidField[] }>;
  buttonCount: number;
  axisCount: number;
  hats: number[];
}

export interface HidState {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

export interface HidPad {
  id: string;
  index: number;
  mapping: '';
  connected: true;
  timestamp: number;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  source: 'hid';
}

/** Chrome's gamepad id, so parsePadId / template USB matching see the same vendor and product. */
export function hidId(vendorId: number, productId: number, productName: string): string {
  const hex = (n: number) => (n & 0xffff).toString(16).padStart(4, '0');
  return `${productName} (Vendor: ${hex(vendorId)} Product: ${hex(productId)})`;
}

function usageParts(value: number, page: number): { page: number; id: number } {
  // Extended usage: page in the high 16 bits. A plain id (<= 0xFFFF) takes the collection's page.
  if (value > 0xffff) return { page: (value >>> 16) & 0xffff, id: value & 0xffff };
  return { page, id: value };
}

function rangeUsage(item: HIDReportItem, i: number, page: number): { page: number; id: number } | null {
  const min = item.usageMinimum ?? 0;
  const max = item.usageMaximum ?? min;
  const pg = min > 0xffff ? (min >>> 16) & 0xffff : max > 0xffff ? (max >>> 16) & 0xffff : page;
  const lo = min > 0xffff ? min & 0xffff : min;
  const hi = max > 0xffff ? max & 0xffff : max;
  if (hi < lo) return null;
  // Fewer usages than reportCount: the last usage repeats (HID).
  return { page: pg, id: lo + Math.min(i, hi - lo) };
}

/** Preferred slot is usage-0x30 (X=0 … hat=9). A second slider takes 7 when no dial claimed it; further copies start at 10. */
function place(preferred: number, used: Set<number>): number {
  if (preferred <= 9 && !used.has(preferred)) { used.add(preferred); return preferred; }
  let i = 10;
  while (used.has(i)) i++;
  used.add(i);
  return i;
}

function assignAxes(usages: number[]): number[] {
  const dial = usages.includes(0x37);
  const used = new Set<number>();
  const index = new Array<number>(usages.length);
  const sliders: number[] = [];
  usages.forEach((u, i) => { if (u === 0x36) sliders.push(i); else index[i] = place(u - 0x30, used); });
  for (const i of sliders) index[i] = place(!used.has(6) ? 6 : !dial && !used.has(7) ? 7 : 10, used);
  return index;
}

interface AxisTodo { field: HidField; usage: number }

function addItem(report: { bit: number; fields: HidField[] }, item: HIDReportItem, page: number, axes: AxisTodo[]) {
  const size = item.reportSize ?? 0;
  const count = item.reportCount ?? 0;
  if (size <= 0 || count <= 0) return;
  const range = !!item.isRange;
  const listed = item.usages ?? [];
  // Constant and padding items occupy bits and carry no control.
  if (item.isConstant || (!range && listed.length === 0)) { report.bit += size * count; return; }
  const logicalMin = item.logicalMinimum ?? 0;
  const logicalMax = item.logicalMaximum ?? 0;
  for (let i = 0; i < count; i++) {
    const u = range ? rangeUsage(item, i, page) : usageParts(listed[Math.min(i, listed.length - 1)], page);
    const bitOffset = report.bit;
    report.bit += size;
    if (!u) continue;
    if (u.page === 0x09 && u.id >= 1) {
      report.fields.push({ bitOffset, bitSize: size, logicalMin, logicalMax, kind: 'button', index: u.id - 1 });
    } else if (u.page === 0x01 && u.id >= 0x30 && u.id <= 0x39) {
      const field: HidField = { bitOffset, bitSize: size, logicalMin, logicalMax, kind: u.id === 0x39 ? 'hat' : 'axis', index: 0 };
      report.fields.push(field);
      axes.push({ field, usage: u.id });
    }
  }
}

/** Per-reportId field layout. reportId 0 is a report with no id. Bit offsets start at the first data bit (the id byte is not in the buffer). */
export function buildLayout(collections: readonly HIDCollectionInfo[] | undefined): HidLayout {
  const reports = new Map<number, { bit: number; fields: HidField[] }>();
  const axes: AxisTodo[] = [];
  const walk = (cols: readonly HIDCollectionInfo[] | undefined, page: number) => {
    for (const c of cols ?? []) {
      const pg = c.usagePage ?? page;
      for (const rep of c.inputReports ?? []) {
        const id = rep.reportId ?? 0;
        let report = reports.get(id);
        if (!report) { report = { bit: 0, fields: [] }; reports.set(id, report); }
        for (const item of rep.items ?? []) addItem(report, item, pg, axes);
      }
      walk(c.children, pg);
    }
  };
  walk(collections, 0);
  const indexes = assignAxes(axes.map((a) => a.usage));
  axes.forEach((a, i) => { a.field.index = indexes[i]; });
  let buttonCount = 0;
  let axisCount = 0;
  const hats: number[] = [];
  const out = new Map<number, { fields: HidField[] }>();
  for (const [id, report] of reports) {
    out.set(id, { fields: report.fields });
    for (const f of report.fields) {
      if (f.kind === 'button') buttonCount = Math.max(buttonCount, f.index + 1);
      else {
        axisCount = Math.max(axisCount, f.index + 1);
        if (f.kind === 'hat' && !hats.includes(f.index)) hats.push(f.index);
      }
    }
  }
  return { reports: out, buttonCount, axisCount, hats };
}

function readBits(data: DataView, offset: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) {
    const bit = offset + i;
    const byte = bit >> 3;
    if (byte >= data.byteLength) break;
    // Little-endian across the buffer: bit 0 of byte 0 is the first bit.
    if (data.getUint8(byte) & (1 << (bit & 7))) v += 2 ** i;
  }
  return v;
}

function toLogical(raw: number, bits: number, logicalMin: number): number {
  if (logicalMin >= 0 || bits <= 0) return raw;
  const span = 2 ** bits;
  return raw >= span / 2 ? raw - span : raw;
}

function axisUnit(logical: number, logicalMin: number, logicalMax: number): number {
  if (logicalMax === logicalMin) return 0;
  return (2 * (logical - logicalMin)) / (logicalMax - logicalMin) - 1;
}

function hatUnit(logical: number, logicalMin: number, logicalMax: number): number {
  // 0..7 and 1..8 both collapse to position 0..7 via (value - logicalMinimum). Outside that, the hat is centred.
  if (logical < logicalMin || logical > logicalMax) return HAT_REST;
  const p = logical - logicalMin;
  if (p > 7) return HAT_REST;
  return -1 + (p * 2) / 7;
}

function buttonState(logical: number, logicalMin: number, logicalMax: number): { pressed: boolean; value: number } {
  if (logicalMax === logicalMin) {
    const on = logical !== 0;
    return { pressed: on, value: on ? 1 : 0 };
  }
  const t = (logical - logicalMin) / (logicalMax - logicalMin);
  const value = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return { pressed: value > 0, value };
}

export function restState(layout: HidLayout): HidState {
  const hat = new Set(layout.hats);
  return {
    buttons: Array.from({ length: layout.buttonCount }, () => ({ pressed: false, value: 0 })),
    axes: Array.from({ length: layout.axisCount }, (_, i) => hat.has(i) ? HAT_REST : 0),
  };
}

/** Apply one report. Unknown reportId returns null and does not touch `state`. */
export function decodeReport(layout: HidLayout, reportId: number, data: DataView, state?: HidState): HidState | null {
  const report = layout.reports.get(reportId);
  if (!report) return null;
  const out = state ?? restState(layout);
  for (const f of report.fields) {
    const logical = toLogical(readBits(data, f.bitOffset, f.bitSize), f.bitSize, f.logicalMin);
    if (f.kind === 'button') {
      while (out.buttons.length <= f.index) out.buttons.push({ pressed: false, value: 0 });
      out.buttons[f.index] = buttonState(logical, f.logicalMin, f.logicalMax);
    } else {
      while (out.axes.length <= f.index) out.axes.push(0);
      out.axes[f.index] = f.kind === 'hat' ? hatUnit(logical, f.logicalMin, f.logicalMax) : axisUnit(logical, f.logicalMin, f.logicalMax);
    }
  }
  return out;
}

function webHid(): HID | null {
  if (typeof navigator === 'undefined' || !('hid' in navigator)) return null;
  const hid = (navigator as Navigator & { hid?: HID }).hid;
  return hid || null;
}

export const hidSupported = (): boolean => webHid() !== null;

interface Entry {
  device: HIDDevice;
  index: number;
  state: HidState;
  timestamp: number;
  onReport: (ev: HIDInputReportEvent) => void;
}

const entries = new Map<HIDDevice, Entry>();
const pending = new Set<HIDDevice>();
const indexByDevice = new WeakMap<HIDDevice, number>();
let nextIndex = HID_INDEX_BASE;
let error: string | null = null;
let override: HidPad[] | null = null;
let attached: HID | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function clock(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* a subscriber must not break device updates */ }
  }
}

function setError(msg: string | null) {
  if (error === msg) return;
  error = msg;
  emit();
}

export const hidError = (): string | null => error;

export function subscribeHid(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : '';
  return msg.replace(/^Failed to execute '[^']+' on '[^']+':\s*/, '').trim() || 'Could not open the device.';
}

function isChooserCancel(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const name = 'name' in e ? String(e.name) : '';
  const msg = 'message' in e ? String(e.message) : '';
  return name === 'NotFoundError' || /no device selected/i.test(msg);
}

function indexFor(device: HIDDevice): number {
  let n = indexByDevice.get(device);
  if (n === undefined) { n = nextIndex++; indexByDevice.set(device, n); }
  return n;
}

function snapshot(p: HidPad): HidPad {
  return { ...p, buttons: p.buttons.map((b) => ({ pressed: b.pressed, value: b.value })), axes: [...p.axes] };
}

async function adopt(device: HIDDevice): Promise<void> {
  if (entries.has(device) || pending.has(device)) return;
  pending.add(device);
  try {
    if (!device.opened) await device.open();
    if (entries.has(device)) return;
    const layout = buildLayout(device.collections);
    const state = restState(layout);
    const onReport = (ev: HIDInputReportEvent) => {
      if (!decodeReport(layout, ev.reportId, ev.data, state)) return;
      const entry = entries.get(device);
      if (entry) entry.timestamp = clock();
    };
    device.addEventListener('inputreport', onReport);
    entries.set(device, { device, index: indexFor(device), state, timestamp: 0, onReport });
    emit();
  } catch (e) {
    setError(errorText(e));
  } finally {
    pending.delete(device);
  }
}

function drop(device: HIDDevice) {
  const entry = entries.get(device);
  if (!entry) return;
  device.removeEventListener('inputreport', entry.onReport);
  entries.delete(device);
  emit();
}

function onConnect(ev: HIDConnectionEvent) { void adopt(ev.device); }
function onDisconnect(ev: HIDConnectionEvent) { drop(ev.device); }

/** Re-open devices the user already granted, and follow plug / unplug. Safe to call more than once. */
export function ensureHid(): void {
  const hid = webHid();
  if (!hid || attached === hid) return;
  if (attached) {
    attached.removeEventListener('connect', onConnect);
    attached.removeEventListener('disconnect', onDisconnect);
  }
  attached = hid;
  const gen = ++generation;
  hid.addEventListener('connect', onConnect);
  hid.addEventListener('disconnect', onDisconnect);
  void hid.getDevices().then((list) => {
    if (gen !== generation) return;
    for (const d of list) void adopt(d);
  }).catch((e: unknown) => { if (gen === generation) setError(errorText(e)); });
}

export async function requestHidDevice(): Promise<string | null> {
  const hid = webHid();
  if (!hid) return null;
  ensureHid();
  try {
    const devices = await hid.requestDevice({ filters: HID_FILTERS });
    if (!devices.length) return null;
    for (const d of devices) await adopt(d);
    if (devices.every((d) => entries.has(d))) setError(null);
    return error;
  } catch (e) {
    if (isChooserCancel(e)) return null;
    const msg = errorText(e);
    setError(msg);
    return msg;
  }
}

/** Fresh objects each call, same as Chrome's getGamepads(). */
export function getHidPads(): HidPad[] {
  if (override) return override.map(snapshot);
  const out: HidPad[] = [];
  for (const e of entries.values()) {
    out.push({
      id: hidId(e.device.vendorId, e.device.productId, e.device.productName),
      index: e.index,
      mapping: '',
      connected: true,
      timestamp: e.timestamp,
      buttons: e.state.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
      axes: e.state.axes.slice(),
      source: 'hid',
    });
  }
  return out;
}

/** Unit tests inject HID pads (or pass null to read the real registry again). */
export function setHidPadsForTest(pads: HidPad[] | null): void { override = pads; }

/** Drop registry state so unit tests don't leak devices or listeners. */
export function resetHidForTest(): void {
  generation++;
  if (attached) {
    attached.removeEventListener('connect', onConnect);
    attached.removeEventListener('disconnect', onDisconnect);
    attached = null;
  }
  for (const e of entries.values()) e.device.removeEventListener('inputreport', e.onReport);
  entries.clear();
  pending.clear();
  override = null;
  error = null;
}
