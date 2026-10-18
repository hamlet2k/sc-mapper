import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeviceTemplate } from '../lib/templates';
import { matchesTemplate, templateCopyOf, templateOptionDetails, templateOptionLabel, templateOptionName, templatePickerGroups, type TemplatePickerGroup } from '../lib/templatePicker';

interface Props {
  templates: readonly DeviceTemplate[];
  automatic: DeviceTemplate;
  deviceName?: string;
  slot?: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  testId: string;
  className?: string;
}

/** Editable ARIA combobox: DOM focus stays on the input while navigating its listbox. */
export function TemplateCombobox({ templates, automatic, deviceName, slot, value, onChange, label, testId, className = '' }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null), popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState<string | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320, maxHeight: 320 });
  const groups = useMemo(() => templatePickerGroups(templates, automatic, deviceName), [templates, automatic, deviceName]);
  const filtered = groups.map((g) => ({ ...g, templates: g.templates.filter((t) => matchesTemplate(t, query, g.label)) })).filter((g) => g.templates.length);
  // A type section contains all its brands so its sticky header spans the entire type.
  const sections: { label: string; groups: TemplatePickerGroup[] }[] = [];
  for (const group of filtered) {
    if (sections.at(-1)?.label !== group.label) sections.push({ label: group.label, groups: [] });
    sections.at(-1)!.groups.push(group);
  }
  const automaticLabel = `Automatic (${automatic.name})`;
  const showAuto = matchesTemplate(automatic, query, 'Automatic');
  // Suggested templates also appear in their normal group; navigate each occurrence by its own key.
  const rowKey = (group: TemplatePickerGroup, value: string) => JSON.stringify([group.label, group.brand ?? '', value]);
  const options = [...(showAuto ? [{ key: 'automatic', value: '' }] : []), ...filtered.flatMap((g) => g.templates.map((t) => ({ key: rowKey(g, t.id), value: t.id })))];
  const current = value ? templates.find((t) => t.id === value) : undefined;
  const closedLabel = value ? current ? templateOptionLabel(current, slot) : value : automaticLabel;
  const highlighted = options.find((o) => o.key === active)?.key ?? options[0]?.key;
  const optionId = (key: string) => `${id}-option-${encodeURIComponent(key)}`;
  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(''); input.current?.focus(); };
  const expand = () => { if (!open) {
    setQuery('');
    const selectedGroup = groups.find((g) => g.templates.some((t) => t.id === value));
    setActive(value && selectedGroup ? rowKey(selectedGroup, value) : 'automatic');
    setOpen(true);
  } };

  useLayoutEffect(() => {
    if (!open) return;
    const place = (event?: Event) => {
      if (event?.target instanceof Node && popup.current?.contains(event.target)) return;
      const rect = input.current!.getBoundingClientRect();
      const width = Math.min(Math.max(rect.width, 360), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12;
      const down = below >= Math.min(240, above);
      const height = Math.min(360, down ? below : above);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), top: down ? rect.bottom + 4 : Math.max(8, rect.top - height - 4), width, maxHeight: Math.max(80, height) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!input.current?.parentElement?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open && highlighted !== undefined) document.getElementById(optionId(highlighted))?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, id]);

  const option = (key: string, v: string, text: string, variant = false, brand?: string, details?: string, custom = false, copyOf?: string, direct = false) => <div key={key} id={optionId(key)} role="option" aria-selected={value === v}
    data-value={v} data-custom={custom || undefined} data-direct={direct || undefined} data-variant={variant || undefined} data-branded={!!brand || undefined}
    onPointerDown={(e) => e.preventDefault()} onClick={() => choose(v)} onPointerMove={() => setActive(key)}
    className={`template-picker-option cursor-pointer text-xs ${highlighted === key ? 'bg-hud/20 text-hud2' : 'text-slate-200 hover:bg-hud/10'}`}>
    {variant && <span aria-hidden="true" className="shrink-0 text-slate-500">↳</span>}
    <span data-template-name className="min-w-0 flex-1">{text}</span>
    {custom && <span data-template-custom className="shrink-0 rounded border border-slate-600 px-1 text-[9px] text-slate-400">Custom</span>}
    {copyOf && <span data-template-copy title={`copy of ${copyOf}`} className="max-w-[35%] truncate text-right text-[10px] text-slate-500">copy of {copyOf}</span>}
    {details && <span data-template-details className="shrink-0 text-right text-[10px] text-slate-500">{details}</span>}
    <span aria-hidden="true" className="w-3 shrink-0 text-hud">{value === v ? '✓' : ''}</span>
  </div>;
  return <div className={`relative min-w-0 ${className}`} data-template-picker>
    <input ref={input} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${id}-listbox`} aria-autocomplete="list"
      aria-activedescendant={open && highlighted !== undefined ? optionId(highlighted) : undefined}
      data-testid={testId} data-value={value} title={closedLabel} value={open ? query : closedLabel} placeholder={closedLabel} autoComplete="off"
      className="w-full rounded border border-edge bg-panel2 py-1 pl-2 pr-7 text-xs text-slate-200 outline-none focus:border-hud"
      onFocus={expand} onClick={expand} onChange={(e) => { setQuery(e.target.value); setActive(null); setOpen(true); }}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setQuery(''); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!open) { expand(); return; }
          const index = options.findIndex((o) => o.key === highlighted);
          setActive(options[(index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.key ?? null);
        } else if (open && (e.key === 'Home' || e.key === 'End')) {
          e.preventDefault();
          setActive((e.key === 'Home' ? options[0] : options.at(-1))?.key ?? null);
        } else if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          if (!open) expand(); else if (highlighted !== undefined) choose(options.find((o) => o.key === highlighted)!.value);
        }
      }} />
    <button type="button" tabIndex={-1} aria-label={`Toggle ${label}`} className="absolute inset-y-0 right-0 px-2 text-slate-400"
      onPointerDown={(e) => e.preventDefault()} onClick={() => { input.current?.focus(); if (open) setOpen(false); else expand(); }}>▾</button>
    {open && createPortal(<div ref={popup} id={`${id}-listbox`} role="listbox" aria-label={label}
      className="template-picker-list scrollbar-thin fixed z-[200] overflow-auto rounded border border-edge bg-panel2 shadow-xl" style={position}>
      {showAuto && option('automatic', '', automaticLabel)}
      {sections.map((section, i) => <div key={section.label} role="group" aria-labelledby={`${id}-type-${i}`} data-group={section.label === 'Suggested for this device' ? 'suggestions' : section.label}>
        <div id={`${id}-type-${i}`} role="presentation" data-type-header className="template-picker-type font-display">{section.label}</div>
        {section.groups.map((g, j) => <div key={g.brand ?? ''} role="group" aria-labelledby={g.brand ? `${id}-brand-${i}-${j}` : `${id}-type-${i}`} data-brand={g.brand}>
          {g.brand && <div id={`${id}-brand-${i}-${j}`} role="presentation" data-brand-header className="template-picker-brand">{g.brand}</div>}
          {g.templates.map((t) => {
            const direct = !g.brand && section.label !== 'Suggested for this device' && section.label !== 'My templates';
            return option(rowKey(g, t.id), t.id, templateOptionName(t, query.trim() ? undefined : g.brand),
              !!t.builtin && !!t.variantOf && !direct, g.brand, templateOptionDetails(t, slot),
              !t.builtin, templateCopyOf(t, templates), direct);
          })}
        </div>)}
      </div>)}
      {!options.length && <div role="status" className="px-3 py-3 text-xs text-slate-400">No matching templates</div>}
    </div>, document.body)}
  </div>;
}
