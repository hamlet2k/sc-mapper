import { maxButton, templateViews, type DeviceTemplate } from './templates';

export const templateFileName = (t: Pick<DeviceTemplate, 'name'>) => `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device'}.sc-template.json`;
/** Built-ins are read-only; customizing creates a user copy with this flag cleared. Id prefixes alone aren't authoritative. */
export const canSubmitTemplate = (t: Pick<DeviceTemplate, 'builtin'>) => !t.builtin;

const text = (s: string | undefined, max: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cell = (s: string | undefined, max = 80) => text(s, max).replace(/[\\|`*_[\]<>]/g, '\\$&') || '—';
const hex = (s: string | undefined) => s ? s.replace(/^0x/i, '').toUpperCase().padStart(4, '0').slice(-4) : '*';

/** A short issue summary only: photos and callout JSON travel in the downloaded file, never in the URL. */
export function templateSubmissionUrl(t: DeviceTemplate, appVersion: string): string {
  const views = templateViews(t);
  const usb = t.match.filter((m) => m.vendor || m.product).map((m) => `${hex(m.vendor)}:${hex(m.product)}`).join(', ') || 'none';
  const names = t.match.map((m) => m.name).filter(Boolean).join('; ');
  const title = `Template: ${[text(t.brand, 40), text(t.name, 80)].filter(Boolean).join(' ')}`;
  const body = [
    `Drag the downloaded \`${templateFileName(t)}\` into this issue. A link cannot carry the file.`,
    '', '| Detail | Value |', '| --- | --- |',
    `| Device name | ${cell(t.name)} |`,
    `| Brand | ${cell(t.brand, 40)} |`,
    `| Author | ${cell(t.author, 40)} |`,
    `| USB vendor:product IDs | ${usb} |`,
    `| Device name match | ${cell(names, 400)} |`,
    `| Callouts | ${t.callouts.length} |`,
    `| Views / pictures | ${views.length} / ${views.filter((v) => v.image).length} |`,
    `| Highest button number | ${maxButton(t)} |`,
    `| App | SC Mapper ${cell(appVersion, 40)} |`,
    '', '- [ ] Photo is my own or I have the right to share it',
    '- [ ] Button numbers checked against the device (press test)',
  ].join('\n');
  return `https://github.com/hamlet2k/sc-mapper/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=template%20submission`;
}
