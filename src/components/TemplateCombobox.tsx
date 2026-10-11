import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeviceTemplate } from '../lib/templates';
import { matchesTemplate, templateOptionLabel, templatePickerGroups } from '../lib/templatePicker';

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
  const automaticLabel = `Automatic (${automatic.name})`;
  const showAuto = matchesTemplate(automatic, query, 'Automatic');
  const options = [...(showAuto ? [{ value: '', label: automaticLabel }] : []), ...filtered.flatMap((g) => g.templates.map((t) => ({ value: t.id, label: templateOptionLabel(t, slot) })))];
  const current = value ? templates.find((t) => t.id === value) : undefined;
  const closedLabel = value ? current ? templateOptionLabel(current, slot) : value : automaticLabel;
  const highlighted = options.find((o) => o.value === active)?.value ?? options[0]?.value;
  const optionId = (v: string) => `${id}-option-${v || 'automatic'}`;
  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(''); input.current?.focus(); };
  const expand = () => { if (!open) { setQuery(''); setActive(value); setOpen(true); } };

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
    if (open && highlighted !== undefined) document.getElementById(`${id}-option-${highlighted || 'automatic'}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, highlighted, id]);

  const option = (v: string, text: string, variant = false) => <div key={v} id={optionId(v)} role="option" aria-selected={value === v}
    data-value={v} data-variant={variant || undefined}
    onPointerDown={(e) => e.preventDefault()} onClick={() => choose(v)} onPointerMove={() => setActive(v)}
    className={`cursor-pointer px-3 py-2 text-xs ${variant ? 'pl-6' : ''} ${highlighted === v ? 'bg-hud/20 text-hud2' : 'text-slate-200 hover:bg-hud/10'}`}>
    {variant && <span aria-hidden="true" className="mr-1 text-slate-500">↳</span>}{text}{value === v && <span aria-hidden="true" className="ml-2 text-hud">✓</span>}
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
          const index = options.findIndex((o) => o.value === highlighted);
          setActive(options[(index + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.value ?? null);
        } else if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          if (!open) expand(); else if (highlighted !== undefined) choose(highlighted);
        }
      }} />
    <button type="button" tabIndex={-1} aria-label={`Toggle ${label}`} className="absolute inset-y-0 right-0 px-2 text-slate-400"
      onPointerDown={(e) => e.preventDefault()} onClick={() => { input.current?.focus(); if (open) setOpen(false); else expand(); }}>▾</button>
    {open && createPortal(<div ref={popup} id={`${id}-listbox`} role="listbox" aria-label={label}
      className="fixed z-[200] overflow-auto rounded border border-edge bg-panel2 py-1 shadow-xl" style={position}>
      {showAuto && option('', automaticLabel)}
      {filtered.map((g, i) => <div key={`${g.label}:${g.brand ?? ''}`} role="group" aria-labelledby={`${id}-group-${i}`} data-group={g.label === 'Suggested for this device' ? 'suggestions' : g.label} data-brand={g.brand}>
        <span id={`${id}-group-${i}`} className="sr-only">{g.label} {g.brand}</span>
        {(i === 0 || filtered[i - 1].label !== g.label) && <div className="px-3 pb-1 pt-3 font-display text-[11px] font-semibold uppercase tracking-wider text-hud2">{g.label}</div>}
        {g.brand && <div className="px-3 py-1 text-[11px] font-semibold text-slate-400">{g.brand}</div>}
        {g.templates.map((t) => option(t.id, templateOptionLabel(t, slot), !!t.variantOf))}
      </div>)}
      {!options.length && <div role="status" className="px-3 py-3 text-xs text-slate-400">No matching templates</div>}
    </div>, document.body)}
  </div>;
}
