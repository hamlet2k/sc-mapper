import type { DeviceTemplate, TemplateCategory } from './templates';

/** Name hints only: intentionally separate from USB/name matching and never auto-applied. */
export function suggestCategory(deviceName: string | undefined): TemplateCategory | undefined {
  const name = (deviceName ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  if (/\b(pedals?|rudder|tpr|tfrp|crosswind|charlie|r1)\b/.test(name)) return 'pedals';
  if (/\b(collective|tcs)\b/.test(name)) return 'collective';
  if (/\b(throttle|tq|quadrant|twcs|mtp|mtq|stecs|ursa|vmax|bravo|(?:t\s*)?50cm4)\b/.test(name)) return 'throttle';
  return undefined;
}

/** Device-specific built-ins in the hinted category, preserving the picker source order. */
export function suggestedTemplates(deviceName: string | undefined, templates: readonly DeviceTemplate[]): DeviceTemplate[] {
  const category = suggestCategory(deviceName);
  return category ? templates.filter((t) => t.builtin && t.brand && t.category === category) : [];
}

export const suggestionHeading = (category: TemplateCategory): string =>
  `${category === 'pedals' ? 'Pedal' : category.charAt(0).toUpperCase() + category.slice(1)} templates`;
