import type { ElementInfo, FeedbackPin } from "./types";

export type Stroke = { points: [number, number][] };
/** Solid opaque cover box in viewport CSS px. Flattened into the image before upload. */
export type Redaction = { id: number; x: number; y: number; w: number; h: number };
export type Annotations = { pins: FeedbackPin[]; strokes: Stroke[]; redactions: Redaction[] };

/** Normalize a drag (any direction) into a positive rect. */
export function rectFrom(x0: number, y0: number, x1: number, y1: number) {
  return { x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.round(Math.abs(x1 - x0)), h: Math.round(Math.abs(y1 - y0)) };
}
export const MIN_REDACT = 6;
export const REDACT_FILL = "#000000";
export type AnnoState = { current: Annotations; past: Annotations[] };

export const EMPTY_ANNO: AnnoState = { current: { pins: [], strokes: [], redactions: [] }, past: [] };

function renumber(pins: FeedbackPin[]): FeedbackPin[] {
  return pins.map((p, i) => ({ ...p, n: i + 1 }));
}

function commit(s: AnnoState, next: Annotations): AnnoState {
  return { current: next, past: [...s.past, s.current].slice(-100) };
}

export type AnnoAction =
  | { type: "addPin"; x: number; y: number; element: ElementInfo | null }
  | { type: "movePin"; n: number; x: number; y: number; element: ElementInfo | null }
  | { type: "deletePin"; n: number }
  | { type: "addStroke"; stroke: Stroke }
  | { type: "addRedaction"; x: number; y: number; w: number; h: number }
  | { type: "moveRedaction"; id: number; x: number; y: number }
  | { type: "deleteRedaction"; id: number }
  | { type: "undo" }
  | { type: "reset" };

export function annoReducer(s: AnnoState, a: AnnoAction): AnnoState {
  const c = s.current;
  switch (a.type) {
    case "addPin":
      return commit(s, { ...c, pins: [...c.pins, { n: c.pins.length + 1, x: a.x, y: a.y, element: a.element }] });
    case "movePin":
      if (!c.pins.some((p) => p.n === a.n)) return s;
      return commit(s, { ...c, pins: c.pins.map((p) => (p.n === a.n ? { ...p, x: a.x, y: a.y, element: a.element } : p)) });
    case "deletePin":
      if (!c.pins.some((p) => p.n === a.n)) return s;
      return commit(s, { ...c, pins: renumber(c.pins.filter((p) => p.n !== a.n)) });
    case "addStroke":
      if (a.stroke.points.length < 2) return s;
      return commit(s, { ...c, strokes: [...c.strokes, a.stroke] });
    case "addRedaction": {
      if (a.w < MIN_REDACT || a.h < MIN_REDACT) return s;
      const id = c.redactions.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      return commit(s, { ...c, redactions: [...c.redactions, { id, x: a.x, y: a.y, w: a.w, h: a.h }] });
    }
    case "moveRedaction":
      if (!c.redactions.some((r) => r.id === a.id)) return s;
      return commit(s, { ...c, redactions: c.redactions.map((r) => (r.id === a.id ? { ...r, x: a.x, y: a.y } : r)) });
    case "deleteRedaction":
      if (!c.redactions.some((r) => r.id === a.id)) return s;
      return commit(s, { ...c, redactions: c.redactions.filter((r) => r.id !== a.id) });
    case "undo":
      if (!s.past.length) return s;
      return { current: s.past[s.past.length - 1], past: s.past.slice(0, -1) };
    case "reset":
      return EMPTY_ANNO;
  }
}

/** Drop near-duplicate points so long strokes stay small. */
export function simplify(points: [number, number][], min = 2): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const l = out[out.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) >= min) out.push([Math.round(p[0]), Math.round(p[1])]);
  }
  return out;
}
