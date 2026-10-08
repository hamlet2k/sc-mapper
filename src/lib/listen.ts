// Turning live input (controllers, keyboard, mouse) into exact Star Citizen inputs, for press-to-search and live highlight.
import { useEffect, useRef, useState } from 'react';
import { beyondCap, comboFrom, GAME_BUTTON_CAP, gamepadInput, joystickInput, PadTracker, scKeyFromCode, snapshot, type PadEvent } from './capture';
import { getPads, padLabel, type PadInfo, type PadLike } from './devices';
import { bindKey, comboLabel, formatInput, isModifier } from './inputs';
import type { Slot } from './types';

/** One physical input, in every form the bindings may use (e.g. a gamepad stick as the axis or as a direction) */
export interface PressHit {
  slot: Slot; instance: number;
  /** input names, the first is the primary one */
  inputs: string[];
  /** device name for display */
  device?: string;
  note?: string;
}
export const hitSpecs = (h: PressHit) => h.inputs.map((i) => formatInput(h.slot, h.instance, i));
export const hitKeys = (h: PressHit) => new Set(h.inputs.map((i) => bindKey(h.slot, h.instance, i)));
export const hitLabel = (h: PressHit) => `${h.slot === 'kb' || h.slot === 'mo' ? '' : `${h.slot.toUpperCase()}${h.instance} `}${comboLabel(h.inputs[0], h.slot)}`;

/** A controller event on a described device as a hit (undefined for axes the game has no name for) */
export function padHit(info: PadInfo, e: PadEvent): PressHit | undefined {
  if (info.kind === 'gp') {
    const c = gamepadInput(e);
    if (!c) return undefined;
    return { slot: 'gp', instance: info.instance, inputs: [c.input, ...(c.alt ?? []).map((a) => a.input).filter((x) => x !== c.input)], device: padLabel(info) };
  }
  if (e.kind === 'axis' && e.index >= 8) return undefined;
  const c = joystickInput(e);
  if (!c) return undefined;
  return { slot: 'js', instance: info.instance, inputs: [c.input], device: padLabel(info), ...(e.kind === 'button' && e.index >= GAME_BUTTON_CAP ? { note: beyondCap(e.index + 1) } : {}) };
}

/**
 * Calls onHit for every new controller press / hat push / axis move while `active`. The loop reads describe/onHit through refs
 * so re-renders never restart it (that would re-baseline the axes). One hit per frame: the first device's, or with `prefer`,
 * the first hit it accepts when several devices report in the same frame.
 */
export function usePadHits(active: boolean, describe: (l: readonly PadLike[]) => PadInfo[], onHit: (h: PressHit) => void, prefer?: (h: PressHit) => boolean) {
  const ref = useRef({ describe, onHit, prefer });
  useEffect(() => { ref.current = { describe, onHit, prefer }; }, [describe, onHit, prefer]);
  useEffect(() => {
    if (!active) return;
    const tracker = new PadTracker();
    let raf = 0;
    const loop = (now: number) => {
      const list = getPads();
      if (list.length) {
        const infos = ref.current.describe(list);
        const evs = tracker.update(infos.map((d, i) => ({ key: d.key, state: snapshot(list[i]) })), now);
        const hits: PressHit[] = [];
        for (const d of infos) {
          const e = evs.get(d.key) ?? [];
          const pick = e.find((x) => x.kind === 'button') ?? e.find((x) => x.kind === 'hat') ?? e.find((x) => x.kind === 'axis');
          const h = pick && padHit(d, pick);
          if (h) hits.push(h);
        }
        const { prefer: pf } = ref.current;
        const h = (pf && hits.find(pf)) || hits[0];
        if (h) ref.current.onHit(h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable);
};

/**
 * Keyboard combos (modifiers + key, or a modifier on its own when released) while `active`.
 * mode 'capture' swallows the keys (press-to-search; Esc calls onEscape); 'passive' only watches and ignores typing in fields
 * and app shortcuts (/, Ctrl+K, Ctrl+Z).
 */
export function useKeyHits(active: boolean, mode: 'capture' | 'passive', onHit: (h: PressHit) => void, onEscape?: () => void) {
  const ref = useRef({ onHit, onEscape });
  useEffect(() => { ref.current = { onHit, onEscape }; }, [onHit, onEscape]);
  useEffect(() => {
    if (!active) return;
    let held: string[] = [];
    let usedMain = false;
    const capture = mode === 'capture';
    const down = (e: KeyboardEvent) => {
      if (!capture && (isTyping(e.target) || e.ctrlKey || e.metaKey || e.key === '/')) return;
      if (capture) {
        if (e.key === 'Escape' && !held.length) { e.preventDefault(); e.stopImmediatePropagation(); ref.current.onEscape?.(); return; }
        e.preventDefault(); e.stopImmediatePropagation();
      }
      if (e.repeat) return;
      const name = scKeyFromCode(e.code);
      if (!name) return;
      if (isModifier(name)) { held = name === 'ralt' ? held.filter((m) => m !== 'lctrl') : held; if (!held.includes(name)) held = [...held, name]; return; }
      usedMain = true;
      ref.current.onHit({ slot: 'kb', instance: 1, inputs: [comboFrom(held, name)] });
    };
    const up = (e: KeyboardEvent) => {
      if (capture) { e.preventDefault(); e.stopImmediatePropagation(); }
      const name = scKeyFromCode(e.code);
      if (!name || !isModifier(name) || !held.includes(name)) return;
      if (!usedMain && !(isTyping(e.target) && !capture)) ref.current.onHit({ slot: 'kb', instance: 1, inputs: [comboFrom(held)] });
      held = held.filter((m) => m !== name);
      if (!held.length) usedMain = false;
    };
    const blur = () => { held = []; usedMain = false; };
    window.addEventListener('keydown', down, capture);
    window.addEventListener('keyup', up, capture);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, capture); window.removeEventListener('keyup', up, capture); window.removeEventListener('blur', blur); };
  }, [active, mode]);
}

/**
 * Keyboard modifiers held right now (lalt, rctrl, lshift …) while `active`, for the live row highlight: a binding with a keyboard
 * modifier fires only while it is held. Watches only (never swallows keys); cleared when the window loses the focus.
 */
export function useHeldKeyMods(active: boolean): ReadonlySet<string> {
  const [mods, setMods] = useState<ReadonlySet<string>>(NO_KEY_MODS);
  useEffect(() => {
    if (!active) return;
    const set = (name: string | undefined, on: boolean) => {
      if (!name || !isModifier(name)) return;
      setMods((m) => {
        if (m.has(name) === on) return m;
        const n = new Set(m);
        if (on) n.add(name); else n.delete(name);
        return n.size ? n : NO_KEY_MODS;
      });
    };
    const down = (e: KeyboardEvent) => set(scKeyFromCode(e.code), true);
    const up = (e: KeyboardEvent) => set(scKeyFromCode(e.code), false);
    const blur = () => setMods(NO_KEY_MODS);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); setMods(NO_KEY_MODS); };
  }, [active]);
  return active ? mods : NO_KEY_MODS;
}
const NO_KEY_MODS: ReadonlySet<string> = new Set();
