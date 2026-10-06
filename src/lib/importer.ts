import { parseSettings } from './devopts';
import { parseRebindInput } from './inputs';
import type { Profile, ProfileDevice, Rebind, Slot } from './types';

/** Decode a file that may be UTF-8 or UTF-16 (with BOM) */
export async function readXmlFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

const TYPE_SLOT: Record<string, Slot> = { keyboard: 'kb', mouse: 'mo', joystick: 'js', gamepad: 'gp', xboxpad: 'gp', ps4pad: 'gp' };

function containerOf(text: string): Element {
  const clean = text.replace(/^\uFEFF/, '').replace(/<\?xml[^>]*\?>/, '').trim();
  const doc = new DOMParser().parseFromString(clean, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`Not valid XML: ${err.textContent?.split('\n')[0] ?? 'parse error'}`);
  // actionmaps.xml can contain several <ActionProfiles>; the one the game uses is "default"
  const profiles = Array.from(doc.getElementsByTagName('ActionProfiles'));
  return profiles.find((p) => p.getAttribute('profileName') === 'default') ?? profiles[0] ?? doc.documentElement;
}
/** the device list (<options type=… instance=… Product=…>) in file order */
function devicesOf(container: Element): ProfileDevice[] {
  const devices: ProfileDevice[] = [];
  for (const o of Array.from(container.children).filter((c) => c.tagName === 'options')) {
    const slot = TYPE_SLOT[(o.getAttribute('type') ?? '').toLowerCase()];
    const product = (o.getAttribute('Product') ?? '').replace(/\{[0-9A-F-]+\}/i, '').replace(/\s+/g, ' ').trim();
    const raw = o.getAttribute('Product') ?? '';
    if (slot && product) devices.push({ slot, instance: Number(o.getAttribute('instance')) || 1, product, ...(raw.trim() !== product ? { rawProduct: raw } : {}) });
  }
  return devices;
}
/** "Refresh game state": only the game's device list (instance -> product) of an actionmaps.xml / layout export; bindings are ignored */
export function parseDeviceList(text: string): ProfileDevice[] {
  return devicesOf(containerOf(text));
}

/**
 * Parse Star Citizen's actionmaps.xml (user/client/0/Profiles/default/actionmaps.xml)
 * or an exported layout (Controls/Mappings/layout_*_exported.xml).
 */
export function parseActionMaps(text: string, fileName: string): Profile {
  const container = containerOf(text);

  const header = container.getElementsByTagName('CustomisationUIHeader')[0];
  const profileName = container.getAttribute('profileName') || header?.getAttribute('label') || '';

  const devices = devicesOf(container);
  const settings = parseSettings(Array.from(container.children).filter((c) => c.tagName === 'options' || c.tagName === 'deviceoptions'));

  const rebinds: Profile['rebinds'] = {};
  let count = 0;
  for (const am of Array.from(container.getElementsByTagName('actionmap'))) {
    const mapName = am.getAttribute('name');
    if (!mapName) continue;
    for (const a of Array.from(am.getElementsByTagName('action'))) {
      const actionName = a.getAttribute('name');
      if (!actionName) continue;
      const list: Rebind[] = [];
      for (const rb of Array.from(a.children).filter((c) => c.tagName === 'rebind' || c.tagName === 'addbind')) {
        const p = parseRebindInput(rb.getAttribute('input') ?? '');
        if (!p) continue;
        const mode = rb.getAttribute('activationMode') || undefined;
        const mt = Number(rb.getAttribute('multiTap')) || undefined;
        const di = rb.getAttribute('defaultInput');
        list.push({ ...p, ...(mode ? { mode } : {}), ...(mt && mt > 1 ? { multiTap: mt } : {}), ...(di != null && di !== '' ? { defaultInput: di } : {}) });
      }
      if (!list.length) continue;
      (rebinds[mapName] ??= {})[actionName] = [...(rebinds[mapName][actionName] ?? []), ...list];
      count += list.length;
    }
  }
  if (!count) throw new Error('No <actionmap>/<rebind> entries found. Is this a Star Citizen actionmaps.xml or layout export?');

  const base = fileName.replace(/\.xml$/i, '');
  const nice = profileName && profileName !== 'default' ? profileName : /^actionmaps$/i.test(base) ? 'My bindings (actionmaps.xml)' : base;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: nice,
    fileName,
    importedAt: new Date().toISOString(),
    devices,
    rebinds,
    rebindCount: count,
    settings,
    original: JSON.parse(JSON.stringify(rebinds)),
  };
}
