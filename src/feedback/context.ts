import type { ElementInfo, TrailEntry } from './types';

export function safeUrl(href: string): string {
  const url = new URL(href);
  for (const key of [...url.searchParams.keys()]) if (/token|code|secret|key|password/i.test(key)) url.searchParams.delete(key);
  // Hash routers can carry query parameters too.
  const q = url.hash.indexOf('?');
  if (q >= 0) {
    const params = new URLSearchParams(url.hash.slice(q + 1));
    for (const key of [...params.keys()]) if (/token|code|secret|key|password/i.test(key)) params.delete(key);
    url.hash = url.hash.slice(0, q) + (params.size ? `?${params}` : '');
  }
  url.username = ''; url.password = '';
  return url.toString();
}
export class TrailBuffer {
  private items: TrailEntry[] = [];
  push(entry: TrailEntry) {
    const last = this.items.at(-1);
    if (entry.kind === 'nav' && last?.kind === 'nav' && last.path === entry.path) return;
    this.items = [...this.items, entry].slice(-20);
  }
  snapshot(): TrailEntry[] { return structuredClone(this.items); }
}
export const trail = new TrailBuffer();
export function describeElement(el: Element): ElementInfo {
  const tag = el.tagName.toLowerCase();
  const testid = el.getAttribute('data-testid');
  const selector = el.id ? `${tag}#${CSS.escape(el.id)}` : testid ? `${tag}[data-testid="${CSS.escape(testid)}"]` : `${el.parentElement?.tagName.toLowerCase() ?? 'body'} > ${tag}`;
  // Do not read form values, password fields, or contenteditable text.
  const privateText = el.closest('input,textarea,[contenteditable]');
  return { testid, id: el.id || null, role: el.getAttribute('role'), ariaLabel: el.getAttribute('aria-label'),
    text: privateText ? '' : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), tag, selector: selector.slice(0, 240) };
}
export function elementAt(x: number, y: number): ElementInfo | null {
  // Inert keeps keyboard/screen-reader focus inside feedback, but also suppresses
  // hit testing. Restore app hit testing only for this synchronous read.
  const root = document.getElementById('root');
  const inert = root?.inert;
  try {
    if (inert) root.inert = false;
    const el = document.elementsFromPoint(x, y).find((e) => !e.closest('[data-feedback-ui]'));
    return el ? describeElement(el) : null;
  } finally { if (inert) root.inert = true; }
}
let started = false;
export function startFeedbackTrail() {
  if (started || import.meta.env.VITE_FEEDBACK_CAPTURE === '0') return;
  started = true;
  const path = () => { const u = new URL(safeUrl(location.href)); return u.pathname + u.search + u.hash; };
  const nav = () => trail.push({ t: Date.now(), kind: 'nav', path: path(), el: null });
  nav();
  document.addEventListener('click', (event) => {
    const el = event.target instanceof Element ? event.target : null;
    if (el && !el.closest('[data-feedback-ui]')) trail.push({ t: Date.now(), kind: 'click', path: path(), el: describeElement(el) });
  }, true);
  window.addEventListener('hashchange', nav);
  window.addEventListener('popstate', nav);
}
export function collectContext(capturedAt: string) {
  const url = new URL(safeUrl(location.href));
  return { route: url.pathname + url.hash, url: url.toString(), viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    userAgent: navigator.userAgent, platform: navigator.platform, touch: navigator.maxTouchPoints > 0,
    buildCommit: __BUILD_COMMIT__, appVersion: __APP_VERSION__, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    capturedAt, trail: trail.snapshot(), view: document.querySelector('[data-view-tab][aria-current="page"]')?.getAttribute('data-view-tab'),
    templateId: document.querySelector('[data-testid="template-select"]')?.getAttribute('data-value'),
    deviceId: document.querySelector('[data-testid="sidebar-slots"] [aria-selected="true"]')?.getAttribute('data-slot-row') };
}
