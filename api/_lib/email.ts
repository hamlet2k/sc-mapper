import type { Payload } from './validation';
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const show = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value) ?? '';
export function buildEmail(p: Payload) {
  const label = p.kind[0].toUpperCase() + p.kind.slice(1);
  const context = Object.entries(p.context).filter(([key]) => key !== 'trail');
  const sections = [['Pins (with element info)', p.pins], ['Click trail', p.context.trail ?? []]] as const;
  return {
    subject: `[SC Mapper] ${label}: ${p.body.replace(/[\r\n]+/g, ' ').slice(0, 60)}`,
    text: `Kind: ${label}\n\n${p.body}\n\nContext\n${context.map(([k, v]) => `${k}: ${show(v)}`).join('\n')}\n\n${sections.map(([k, v]) => `${k}\n${JSON.stringify(v, null, 2)}`).join('\n\n')}`,
    html: `<h1>${label}</h1><p style="white-space:pre-wrap">${escapeHtml(p.body)}</p><h2>Context</h2><table>${context.map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(show(v))}</td></tr>`).join('')}</table>${sections.map(([k, v]) => `<h2>${k}</h2><pre>${escapeHtml(JSON.stringify(v, null, 2))}</pre>`).join('')}`,
  };
}
