// A visible tooltip for icon buttons (the native title tooltip is slow, easy to miss and not shown on keyboard focus).
// Wraps one element without changing layout (display: contents); the bubble is portalled to <body> so toolbars with
// overflow: hidden or sticky headers can't clip it. Keep an aria-label on the wrapped control: this is visual only.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 250;

export function Tip({ label, children, testid }: { label: ReactNode; children: ReactNode; testid?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const target = () => (ref.current?.firstElementChild as HTMLElement | null) ?? null;
  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { const el = target(); if (el) setAnchor(el.getBoundingClientRect()); }, delay);
  };
  const hide = () => { window.clearTimeout(timer.current); setAnchor(null); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!anchor) return;
    const off = () => hide();
    window.addEventListener('scroll', off, true);
    window.addEventListener('keydown', off);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('keydown', off); };
  }, [anchor]);
  return (
    <span ref={ref} className="contents" onMouseEnter={() => show(SHOW_DELAY_MS)} onMouseLeave={hide} onPointerDown={hide}
      onFocus={(e) => { if ((e.target as HTMLElement).matches?.(':focus-visible')) show(0); }} onBlur={hide}>
      {children}
      {anchor && createPortal(<Bubble anchor={anchor} testid={testid}>{label}</Bubble>, document.body)}
    </span>
  );
}

function Bubble({ anchor, children, testid }: { anchor: DOMRect; children: ReactNode; testid?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, m = 6;
    const below = anchor.bottom + m + h <= window.innerHeight - 4 || anchor.top - m - h < 4;
    const left = Math.min(window.innerWidth - w - 6, Math.max(6, anchor.left + anchor.width / 2 - w / 2));
    setPos({ left, top: below ? anchor.bottom + m : anchor.top - m - h, below });
  }, [anchor]);
  return (
    <div ref={ref} role="tooltip" data-testid={testid ?? 'tooltip'}
      className="pointer-events-none fixed z-[80] max-w-xs rounded border border-hud/40 bg-[#0b1726] px-2 py-1 text-[11px] leading-snug text-slate-100 shadow-[0_6px_18px_rgba(0,0,0,.6)]"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {children}
    </div>
  );
}
