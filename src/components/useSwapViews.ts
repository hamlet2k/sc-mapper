import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceTemplate } from '../lib/templates';
import { swapGroups, swapInputs, swapPresses, swapShown, visibleViews } from '../lib/viewSwap';

const KEY = 'sc-mapper:swap-views';
type Store = Record<string, Record<string, string>>;
const load = (): Store => { try { const o = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };

/**
 * Swappable views of a template (viewSwap.ts) for one device: the view shown per swap group, switched by a press on a control
 * of another view of the group or by hand, remembered per template + device (localStorage). `shown` = the template to render.
 */
export function useSwapViews(t: DeviceTemplate, active: ReadonlySet<string>, deviceKey: string) {
  const key = `${t.id}|${deviceKey}`;
  const [store, setStore] = useState<Store>(load);
  const chosen = useMemo(() => store[key] ?? {}, [store, key]);
  const choose = useCallback((pick: Record<string, string>) => setStore((s) => {
    const cur = s[key] ?? {};
    if (Object.entries(pick).every(([g, v]) => cur[g] === v)) return s;
    const n = { ...s, [key]: { ...cur, ...pick } };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  }), [key]);
  const inputs = useMemo(() => swapInputs(t), [t]);
  const prev = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const p = swapPresses(prev.current, active, inputs);
    prev.current = active;
    if (p) choose(p);
  }, [active, inputs, choose]);
  const groups = useMemo(() => swapGroups(t), [t]);
  const current = useMemo(() => swapShown(t, chosen), [t, chosen]);
  const shown = useMemo(() => visibleViews(t, chosen), [t, chosen]);
  return { shown, groups, current, choose };
}
