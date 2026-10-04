// Value ranges for the device settings Star Citizen stores in actionmaps.xml / layout_*_exported.xml.
// What is confirmed and where from (see README "Value ranges for the sliders"):
//  * deadzone / saturation are fractions of the axis range (0..1). Defaults: saturation 1.00, deadzone 0.03 (x, y), 0 (z, sliders),
//    0.10 (rotations) per the Star Citizen Wiki "Game Options" table (2.x era; current defaults are not in the game files).
//    Every deadzone the game wrote in the real files we test with is a multiple of 0.0099 (0.0099, 0.0198, 0.0297, 0.0495, 0.0792,
//    0.2475), i.e. the in-game slider moves in 1 % steps scaled by 0.99. Highest seen: 0.2475. Saturation seen: 0.8405..0.9405.
//    Players report that saturation 0 makes the setting disappear from the game's options screen (reddit r/starcitizen).
//  * exponent: default 1.00 (wiki); defaultProfile.xml (4.10) sets 2.5 on two groups; real files use 1.0..2.5. The game turns an
//    exponent into curve points out = in^exponent (philchuang actionmaps.3.17.4.xml: 0.1 -> 0.0631 = 0.1^1.2).
//  * curve points: in and out are 0..1 (defaultProfile.xml default curves use 0.1..0.9, game-written curves include 0,0 and 1,1).
// Upper/lower limits the game's UI enforces are not in any file we could find, so where unconfirmed the app uses a conservative
// range (inside what real files contain or what the format allows) and says so.

export interface SettingRange {
  key: 'deadzone' | 'saturation' | 'exponent' | 'point';
  label: string;
  min: number; max: number; step: number;
  /** game default, when known */
  def?: number;
  /** true when both limits are confirmed by the format/game files; false = conservative limits chosen by the app */
  confirmed: boolean;
  /** values found in real game-written files */
  observed?: [number, number];
  note: string;
}

export const GAME_STEP = 0.0099;

export const RANGES: Record<SettingRange['key'], SettingRange> = {
  deadzone: {
    key: 'deadzone', label: 'Deadzone', min: 0, max: 0.5, step: 0.0005, confirmed: false, observed: [0, 0.2475],
    note: 'Fraction of the axis travel ignored around the centre (0 = none). Format: 0..1. The app limits it to 0..0.5 (conservative: real files go up to 0.2475; the game UI limit is not documented).',
  },
  saturation: {
    key: 'saturation', label: 'Saturation', min: 0.5, max: 1, step: 0.0005, def: 1, confirmed: false, observed: [0.8405, 0.9405],
    note: 'Axis travel at which the output reaches 100 % (1 = full travel, the default). Format: 0..1. The app limits it to 0.5..1 (conservative: real files use 0.84..0.94, and 0 is reported to hide the setting in game).',
  },
  exponent: {
    key: 'exponent', label: 'Exponent', min: 1, max: 3, step: 0.05, def: 1, confirmed: false, observed: [1, 2.5],
    note: 'Response curve power: output = input^exponent (1 = linear, higher = finer near the centre). The app limits it to 1..3 (conservative: real files and defaultProfile.xml use 1..2.5; the game UI limit is not documented).',
  },
  point: {
    key: 'point', label: 'Curve point', min: 0, max: 1, step: 0.01, confirmed: true,
    note: 'Custom curve points: in and out are both 0..1 for one half of the axis (mirrored for the other half), in increasing order of in.',
  },
};

export const clampTo = (r: SettingRange, v: number) => Math.min(r.max, Math.max(r.min, v));
export const inRange = (r: SettingRange, v: number) => v >= r.min - 1e-9 && v <= r.max + 1e-9;
/** the in-game slider position (percent) a stored deadzone/saturation value most likely corresponds to (value / 0.0099) */
export const gamePercent = (v: number) => Math.round((v / GAME_STEP) * 10) / 10;
/** nearest value on the game's 1 % grid (multiples of 0.0099), as the game writes it */
export const snapToGame = (v: number) => Math.round(Math.round(v / GAME_STEP) * GAME_STEP * 1e6) / 1e6;
/** deadzone defaults per axis from the Star Citizen Wiki (2.x era) */
export const WIKI_DEADZONE: Record<string, number> = { x: 0.03, y: 0.03, z: 0, rotx: 0.1, roty: 0.1, rotz: 0.1, slider1: 0 };
/** curve points sorted by input, clamped to 0..1 */
export const tidyCurve = (pts: { x: number; y: number }[]) =>
  pts.map((p) => ({ x: clampTo(RANGES.point, p.x), y: clampTo(RANGES.point, p.y) })).sort((a, b) => a.x - b.x);
