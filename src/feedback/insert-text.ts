/** Insert dictated text at a caret range, adding spaces at word boundaries. */
export function insertAtCursor(
  value: string,
  text: string,
  sel: { start: number; end: number } | null,
): { value: string; caret: number } {
  const piece = text.trim();
  if (!piece) return { value, caret: sel?.end ?? value.length };
  const start = sel ? Math.max(0, Math.min(sel.start, value.length)) : value.length;
  const end = sel ? Math.max(start, Math.min(sel.end, value.length)) : value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^\s/.test(after) ? " " : "";
  const next = before + lead + piece + trail + after;
  return { value: next, caret: (before + lead + piece).length };
}
