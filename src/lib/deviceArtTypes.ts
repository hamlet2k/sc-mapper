/** geometry of a generated device template picture (scripts/gen-device-art.mjs): canvas size, control anchors (canvas units) and
 * glow outlines. The picture itself is loaded separately (DEVICE_SVG), only when the template is shown. */
export interface DeviceArt {
  w: number;
  h: number;
  anchors: Record<string, [number, number]>;
  /** outline of each control relative to its anchor */
  regions: Record<string, string>;
  /** one outline per input for multi-input controls (same order as the callout inputs) */
  inputRegions: Record<string, string[]>;
}
