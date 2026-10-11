import { maxButton, templateVariants, type DeviceTemplate } from './templates';
import { suggestedTemplates } from './suggest';

export interface TemplatePickerGroup { label: string; brand?: string; templates: DeviceTemplate[] }
const TYPES = [
  ['stick', 'Sticks'], ['throttle', 'Throttles'], ['pedals', 'Pedals'],
  ['collective', 'Collectives'], ['panel', 'Panels'], ['gamepad', 'Gamepads'],
  ['generic', 'Generic'], ['user', 'My templates'],
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
  const suggested = templates.filter((t) => suggestedIds.has(t.id));
  const remaining = templates.filter((t) => !suggestedIds.has(t.id));
  const brandOf = (t: DeviceTemplate) => (t.brand || templates.find((b) => b.id === t.variantOf)?.brand || '').trim();
  const family = (t: DeviceTemplate) => {
    const base = t.variantOf ? templates.find((b) => b.id === t.variantOf) : undefined;
    const category = t.category ?? base?.category;
    return category && TYPES.some(([key]) => key === category) ? category : !t.builtin && !category ? 'user' : 'generic';
  };
  return [
    ...(suggested.length ? [{ label: 'Suggested for this device', templates: orderTemplateFamilies(suggested) }] : []),
    ...TYPES.flatMap(([key, label]) => {
      const members = remaining.filter((t) => family(t) === key);
      const brands = [...new Map(members.map((t) => [brandOf(t).toLocaleLowerCase(), brandOf(t)])).values()].sort(alphabetical);
      return brands.map((brand) => ({ label, brand: brand || undefined, templates: orderTemplateFamilies(members.filter((t) => brandOf(t).toLocaleLowerCase() === brand.toLocaleLowerCase())) }));
    }),
  ];
}

export function matchesTemplate(t: DeviceTemplate, query: string, group?: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const text = `${t.name} ${t.brand ?? ''} ${t.category ?? ''} ${group ?? ''}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}
export function templateOptionLabel(t: DeviceTemplate, slot?: string): string {
  const count = maxButton(t);
  return `${t.name}${slot && t.slot !== slot ? ` · ${t.slot}` : ''}${count > 32 ? ` · ${count} buttons` : ''}`;
}
