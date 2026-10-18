import { maxButton, templateVariants, type DeviceTemplate } from './templates';
import { suggestedTemplates } from './suggest';

export interface TemplatePickerGroup { label: string; brand?: string; templates: DeviceTemplate[] }
const TYPES = [
  ['stick', 'Sticks'], ['throttle', 'Throttles'], ['pedals', 'Pedals'],
  ['collective', 'Collectives'], ['panel', 'Panels'], ['gamepad', 'Gamepads'],
  ['generic', 'Generic'],
] as const;
const alphabetical = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Sort families by their base's name; variants stay immediately below the base. */
export function orderTemplateFamilies(templates: readonly DeviceTemplate[]): DeviceTemplate[] {
  const ids = new Set(templates.map((t) => t.id));
  const roots = templates.filter((t) => !t.variantOf || !ids.has(t.variantOf)).sort((a, b) => alphabetical(a.name, b.name));
  const result: DeviceTemplate[] = [], seen = new Set<string>();
  const visit = (t: DeviceTemplate) => {
    if (seen.has(t.id)) return;
    seen.add(t.id); result.push(t);
    templates.filter((v) => v.variantOf === t.id).sort((a, b) => alphabetical(a.name, b.name)).forEach(visit);
  };
  roots.forEach(visit);
  templates.forEach(visit);
  return result;
}

export function templatePickerGroups(templates: readonly DeviceTemplate[], auto?: DeviceTemplate, deviceName?: string): TemplatePickerGroup[] {
  const suggestedIds = new Set([
    ...(auto ? [auto.id] : []), ...templateVariants([...templates], auto).map((t) => t.id),
    ...suggestedTemplates(deviceName, templates).map((t) => t.id),
  ]);
  const brandOf = (t: DeviceTemplate) => {
    const brand = (t.brand ?? '').trim();
    return /^generic$/i.test(brand) ? '' : brand;
  };
  const suggested = templates.filter((t) => suggestedIds.has(t.id) && (!t.builtin || brandOf(t)));
  const remaining = templates.filter((t) => t.builtin);
  const users = templates.filter((t) => !t.builtin).sort((a, b) => alphabetical(a.name, b.name));
  const family = (t: DeviceTemplate) => {
    const base = t.variantOf ? templates.find((b) => b.id === t.variantOf) : undefined;
    const category = t.category ?? base?.category;
    return category && TYPES.some(([key]) => key === category) ? category : 'generic';
  };
  return [
    ...(suggested.length ? [{ label: 'Suggested for this device', templates: orderTemplateFamilies(suggested) }] : []),
    ...(users.length ? [{ label: 'My templates', templates: users }] : []),
    ...TYPES.flatMap(([key, label]) => {
      const members = remaining.filter((t) => family(t) === key);
      const brands = [...new Map(members.map((t) => [brandOf(t).toLocaleLowerCase(), brandOf(t)])).values()].sort((a, b) => !a ? -1 : !b ? 1 : alphabetical(a, b));
      return brands.map((brand) => {
        const items = members.filter((t) => brandOf(t).toLocaleLowerCase() === brand.toLocaleLowerCase());
        return { label, brand: brand || undefined, templates: brand ? orderTemplateFamilies(items)
          : items.sort((a, b) => Number(/^generic\b/i.test(b.name)) - Number(/^generic\b/i.test(a.name)) || alphabetical(a.name, b.name)) };
      });
    }),
  ];
}

/** Older copies have no source id; their default copy name still identifies the built-in. */
export function templateCopyOf(t: DeviceTemplate, templates: readonly DeviceTemplate[]): string | undefined {
  if (t.builtin) return undefined;
  const sourceName = t.name.replace(/(?:\s*\(copy\))+\s*$/i, '').trim();
  return templates.find((b) => b.builtin && (b.id === t.variantOf
    || (sourceName !== t.name.trim() && b.name.toLocaleLowerCase() === sourceName.toLocaleLowerCase())))?.name;
}

export function matchesTemplate(t: DeviceTemplate, query: string, group?: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${t.name} ${t.brand ?? ''} ${t.category ?? ''} ${group ?? ''}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
/** Shorten only the visible name within a brand group, leaving the template untouched. */
export function templateOptionName(t: DeviceTemplate, brand?: string): string {
  if (!brand || !t.name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase())) return t.name;
  const suffix = t.name.slice(brand.length);
  const model = suffix.replace(/^[\s\p{P}\p{S}]+/u, '');
  return model && model !== suffix ? model : t.name;
}
export function templateOptionDetails(t: DeviceTemplate, slot?: string): string {
  const count = maxButton(t);
  return [slot && t.slot !== slot ? t.slot : '', count > 32 ? `${count} buttons` : ''].filter(Boolean).join(' · ');
}
export function templateOptionLabel(t: DeviceTemplate, slot?: string): string {
  const details = templateOptionDetails(t, slot);
  return `${t.name}${details ? ` · ${details}` : ''}`;
}
