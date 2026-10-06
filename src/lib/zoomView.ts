/* Synced zoom / pan for the picture preparation panes. One camera in the original picture's (working) pixel coordinates:
 * `z` screen px per original px, (cx, cy) the original-picture point shown at the pane centre. Every pane uses the same camera,
 * and the result picture is placed by its own mapping onto the original (trim + scale + margin), so both panes show exactly
 * the same spot of the product at the same size. Pure (unit-tested). */
export interface ZRect { x: number; y: number; w: number; h: number }
export interface View { z: number; cx: number; cy: number }

/** the camera that shows all rects (union) in a pw x ph pane, with a little air */
export function fitView(rects: ZRect[], pw: number, ph: number, air = 0.94): View {
  const rs = rects.filter((r) => r.w > 0 && r.h > 0);
  if (!rs.length || pw <= 0 || ph <= 0) return { z: 1, cx: 0, cy: 0 };
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  return { z: air * Math.min(pw / (x1 - x0), ph / (y1 - y0)), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
export const clampZoom = (z: number, min: number, max: number) => Math.min(max, Math.max(min, z));
/** zoom by `factor` keeping the original point under the pane position (px, py) where it is */
export function zoomAt(v: View, factor: number, px: number, py: number, pw: number, ph: number, min = 0.01, max = 64): View {
  const z = clampZoom(v.z * factor, min, max);
  const ox = v.cx + (px - pw / 2) / v.z, oy = v.cy + (py - ph / 2) / v.z; // original point under the cursor
  return { z, cx: ox - (px - pw / 2) / z, cy: oy - (py - ph / 2) / z };
}
/** drag the picture by (dx, dy) screen px */
export const panBy = (v: View, dx: number, dy: number): View => ({ ...v, cx: v.cx - dx / v.z, cy: v.cy - dy / v.z });
/** where a rect (original coordinates) lands in the pane, in px */
export function place(v: View, r: ZRect, pw: number, ph: number): { left: number; top: number; width: number; height: number } {
  return { left: pw / 2 + (r.x - v.cx) * v.z, top: ph / 2 + (r.y - v.cy) * v.z, width: r.w * v.z, height: r.h * v.z };
}
