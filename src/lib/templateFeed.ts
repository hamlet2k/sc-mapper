// Public template feed: the built-in device templates' hardware definitions (pictures, callouts, match rules, input names) published
// as static JSON next to the app (/templates/index.json + /templates/<id>.json, generated at build time by the `template-feed` Vite
// plugin in vite.config.ts through scripts/template-feed.ts), so other apps (e.g. DCS Mapper) can reuse them. Bindings are never
// part of it. The built-in template objects stay the single source of truth: nothing here is hand-maintained. See docs/template-feed.md.
// Not imported by the app itself (no runtime cost); pure and environment-neutral (the caller provides sha256 and the photo bytes).
import { BUILTIN_TEMPLATES } from './builtinTemplates';
import { DEVICE_TEMPLATES } from './deviceTemplates';
import { DEVICE_PHOTO_SIZES } from './devicePhotoSizes';
import { BUILTIN_PHOTO_RE, templateForFile, type DeviceTemplate, type TemplateMatch } from './templates';

export const FEED_FORMAT = 'sc-mapper-template-feed';
/** bumped only for breaking changes (additive fields keep 1); see docs/template-feed.md */
export const FEED_FORMAT_VERSION = 1;
/** where the feed lives on the site (absolute path) */
export const FEED_DIR = '/templates';
export const FEED_INDEX = `${FEED_DIR}/index.json`;
export const FEED_DOCS = 'https://github.com/hamlet2k/sc-mapper/blob/main/docs/template-feed.md';
export const INPUT_NAMING = 'star-citizen';
export const INPUT_NAMING_DESCRIPTION =
  'Callout inputs use Star Citizen joystick / gamepad input names without the device prefix (js1_ / gp1_): buttonN (1-based DirectInput ' +
  'button number), hatN_up / hatN_right / hatN_down / hatN_left (POV hat N), axes x y z rotx roty rotz slider1 slider2; gamepads (slot gp): ' +
  'a b x y shoulderl shoulderr triggerl_btn triggerr_btn thumbl thumbr back start dpad_up/right/down/left, axes thumblx thumbly thumbrx ' +
  'thumbry triggerl triggerr. An empty string is an input whose number the device does not fix (user-configured).';

/** a template's file path in the feed */
export const feedFile = (id: string) => `${FEED_DIR}/${id}.json`;
/** path of the exported SVG of a template drawn with generated art (no photo) */
export const feedArtFile = (id: string) => `${FEED_DIR}/art/${id}.svg`;

export interface FeedPhoto { width: number; height: number; bytes?: number; hash?: string; productBox: { x: number; y: number; w: number; h: number } }
export interface FeedEntry {
  id: string; name: string; brand?: string; slot: 'js' | 'gp'; builtin: true; variantOf?: string; match: TemplateMatch[];
  file: string; hash: string; bytes: number; photos: string[];
  /** generated vector art (templates without photos): the same picture as the template's embedded `image`, as a plain SVG file */
  art?: { url: string; width: number; height: number };
}
export interface FeedIndex {
  format: typeof FEED_FORMAT; formatVersion: typeof FEED_FORMAT_VERSION; generatedAt: string; appVersion?: string; commit?: string;
  docs: string; inputNaming: typeof INPUT_NAMING; inputNamingDescription: string; templateFormat: 'sc-mapper-device-template'; templateVersion: 1;
  count: number; templates: FeedEntry[]; photos: Record<string, FeedPhoto>;
}
export interface FeedOptions {
  /** hex sha256 of a string (UTF-8) or bytes */
  sha256: (data: string | Uint8Array) => string;
  /** bytes of a built-in photo (/device-photos/<name>.webp), undefined when missing */
  photoFile?: (url: string) => Uint8Array | undefined;
  generatedAt: string;
  appVersion?: string;
  commit?: string;
}

/* ------------------------------------------------------------- deterministic JSON */
/** preferred key order (any object level); other keys follow alphabetically. Keeps files readable and their bytes independent of how
 * the template objects happen to be built */
const KEY_ORDER = ['format', 'version', 'id', 'name', 'brand', 'slot', 'kind', 'builtin', 'variantOf', 'notes', 'vendor', 'product', 'buttons', 'inputs',
  'label', 'group', 'view', 'aspect', 'match', 'image', 'width', 'height', 'swap', 'x', 'y', 'anchor', 'box', 'region', 'inputRegions', 'views', 'callouts'];
const RANK = new Map(KEY_ORDER.map((k, i) => [k, i]));
function canonical(v: unknown, path: string): unknown {
  if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') throw new Error(`template feed: ${typeof v} at ${path}`);
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`template feed: non-finite number at ${path}`);
  if (Array.isArray(v)) return v.map((x, i) => canonical(x, `${path}[${i}]`));
  if (!v || typeof v !== 'object') return v;
  const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort((a, b) => (RANK.get(a) ?? 1e3) - (RANK.get(b) ?? 1e3) || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(keys.map((k) => [k, canonical((v as Record<string, unknown>)[k], `${path}.${k}`)]));
}
/** JSON with a stable key order (see KEY_ORDER), undefined dropped; throws on functions and non-finite numbers */
export const stableJson = (v: unknown, indent = 1) => `${JSON.stringify(canonical(v, '$'), null, indent)}\n`;

/* ------------------------------------------------------------- templates */
/** every built-in template (generic + device-specific, grip variants included), pictures resolved (lazy art loaded) */
export async function feedSourceTemplates(): Promise<DeviceTemplate[]> {
  const all = [...BUILTIN_TEMPLATES, ...DEVICE_TEMPLATES];
  const seen = new Set<string>();
  for (const t of all) { if (seen.has(t.id)) throw new Error(`template feed: duplicate template id “${t.id}”`); seen.add(t.id); }
  return Promise.all(all.map(async (t) => (t.image || t.views?.length || !t.loadImage ? t : { ...t, image: await t.loadImage() })));
}
/**
 * The feed object of a built-in template: what the app's “Export template” writes for it (templateForFile: format
 * 'sc-mapper-device-template', version 1, picture resolved, no lazy loader) plus `builtin: true` and `variantOf`; never a timestamp.
 */
export function feedTemplate(t: DeviceTemplate): DeviceTemplate {
  const { updatedAt: _u, loadImage: _l, ...file } = templateForFile(t);
  return { ...file, builtin: true, ...(t.variantOf ? { variantOf: t.variantOf } : {}) };
}
/** the SVG markup of a data:image/svg+xml URL (undefined for anything else) */
export function svgFromDataUrl(u: string | undefined): string | undefined {
  const m = u ? /^data:image\/svg\+xml([^,]*),(.*)$/s.exec(u) : null;
  if (!m) return undefined;
  return /;base64/i.test(m[1]) ? new TextDecoder().decode(Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0))) : decodeURIComponent(m[2]);
}
const svgSize = (svg: string, aspect: number) => {
  const vb = /viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/.exec(svg);
  return vb ? { width: Number(vb[1]), height: Number(vb[2]) } : { width: 1000, height: Math.round(1000 / aspect) };
};
const photoKey = (url: string) => /^\/device-photos\/(.+)\.[a-z]+$/.exec(url)?.[1] ?? '';

/**
 * The whole feed: file path (relative to the site root, no leading slash) -> content. Per-template files are deterministic (same
 * template -> same bytes -> same hash); only index.json carries the build time and commit. `problems` lists what a client could not
 * use (missing photo files, pictures that are neither a built-in photo nor generated SVG art): the build fails on any.
 */
export async function buildTemplateFeed(opts: FeedOptions, source?: DeviceTemplate[]): Promise<{ files: Map<string, string>; index: FeedIndex; problems: string[] }> {
  const list = source ?? (await feedSourceTemplates());
  const files = new Map<string, string>(), problems: string[] = [], photos: Record<string, FeedPhoto> = {};
  const entries: FeedEntry[] = [];
  for (const t of list) {
    const ft = feedTemplate(t);
    const json = stableJson(ft);
    const bytes = new TextEncoder().encode(json).length;
    files.set(feedFile(t.id).slice(1), json);
    const pictures = ft.views?.length ? ft.views.map((v) => v.image) : ft.image && !ft.image.startsWith('data:') ? [ft.image] : [];
    const urls = [...new Set(pictures.filter((x): x is string => !!x))];
    for (const u of urls) {
      if (!BUILTIN_PHOTO_RE.test(u)) { problems.push(`${t.id}: view picture is not a built-in photo path (${u.slice(0, 40)}…)`); continue; }
      if (photos[u]) continue;
      const size = DEVICE_PHOTO_SIZES[photoKey(u)];
      const data = opts.photoFile?.(u);
      if (opts.photoFile && !data) problems.push(`${t.id}: photo file missing for ${u}`);
      if (!size) { problems.push(`${t.id}: no size for ${u} in devicePhotoSizes`); continue; }
      const [width, height, x, y, w, h] = size;
      photos[u] = { width, height, ...(data ? { bytes: data.length, hash: opts.sha256(data) } : {}), productBox: { x, y, w, h } };
    }
    let art: FeedEntry['art'];
    if (!ft.views?.length && ft.image) {
      const svg = svgFromDataUrl(ft.image);
      if (svg) {
        art = { url: feedArtFile(t.id), ...svgSize(svg, ft.aspect) };
        files.set(art.url.slice(1), svg.endsWith('\n') ? svg : `${svg}\n`);
      } else if (ft.image.startsWith('data:')) problems.push(`${t.id}: picture is neither generated SVG art nor a built-in photo`);
    }
    entries.push({
      id: t.id, name: t.name, ...(t.brand ? { brand: t.brand } : {}), slot: t.slot, builtin: true, ...(t.variantOf ? { variantOf: t.variantOf } : {}),
      match: t.match, file: feedFile(t.id), hash: opts.sha256(json), bytes, photos: urls, ...(art ? { art } : {}),
    });
  }
  const sortedPhotos = Object.fromEntries(Object.keys(photos).sort().map((k) => [k, photos[k]]));
  const index: FeedIndex = {
    format: FEED_FORMAT, formatVersion: FEED_FORMAT_VERSION, generatedAt: opts.generatedAt,
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}), ...(opts.commit ? { commit: opts.commit } : {}),
    docs: FEED_DOCS, inputNaming: INPUT_NAMING, inputNamingDescription: INPUT_NAMING_DESCRIPTION,
    templateFormat: 'sc-mapper-device-template', templateVersion: 1, count: entries.length, templates: entries, photos: sortedPhotos,
  };
  // the index keeps its own (documented) key order; JSON.stringify of the literal above is already deterministic
  files.set(FEED_INDEX.slice(1), `${JSON.stringify(index, null, 2)}\n`);
  return { files, index, problems };
}
