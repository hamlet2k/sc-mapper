export type Slot = 'kb' | 'mo' | 'js' | 'gp';
export type Device = 'keyboard' | 'mouse' | 'joystick' | 'gamepad';
/**
 * Rebind device groups as the game treats them: keyboard and mouse are one device ("KeyboardMouse"),
 * so a kb1_/mo1_ rebind replaces both the keyboard= and mouse= defaults of an action.
 */
export type Group = 'km' | 'js' | 'gp';

export interface DefaultBinding { slot: Slot; input: string; mode?: string }
export interface DefaultAction { name: string; label: string; desc?: string; mode?: string; hidden?: boolean; d: DefaultBinding[] }
export interface DefaultMap {
  name: string; label: string; category: string;
  /** raw UICategory key from defaultProfile.xml (e.g. "@ui_CCSpaceFlight"), used for layout export headers */
  cat?: string;
  hidden?: boolean; actions: DefaultAction[];
}
export interface DefaultsMeta {
  game: string; branch?: string; version?: string; buildDate?: string; channel?: string;
  source: string; sourceUrl: string; generated: string;
}
/** One <optiongroup> of a device <optiontree> in defaultProfile.xml (flattened, in tree order) */
export interface OptionTreeGroup {
  name: string; label: string; depth: number; parent?: string;
  /** UIShowCurve / UIShowInvert: 1 = editable control, -1 = group heading whose setting applies to its children, 0 = hidden */
  showCurve: number; showInvert: number;
  /** game defaults for this group (strings as written in defaultProfile.xml) */
  invert?: string; exponent?: string; curve?: [number, number][]; curveReset?: boolean;
}
export interface OptionTree { instances?: number; sensMin?: number; sensMax?: number; groups: OptionTreeGroup[] }
export interface DefaultsData { meta: DefaultsMeta; maps: DefaultMap[]; optionTrees?: Record<string, OptionTree> }

export interface Rebind {
  slot: Slot; instance: number; input: string; mode?: string; multiTap?: number;
  /** informational: the default input this rebind replaced (the game writes it; kept for faithful re-export) */
  defaultInput?: string;
}
export type RebindMap = Record<string, Record<string, Rebind[]>>;
export interface ProfileDevice {
  slot: Slot; instance: number; product: string;
  /** Product attribute as written by the game, including the DirectInput GUID with the USB vendor/product ids */
  rawProduct?: string;
}
export interface Profile {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  devices: ProfileDevice[];
  /** map name -> action name -> rebinds */
  rebinds: RebindMap;
  rebindCount: number;
  /** legacy (profiles saved before device settings were editable): <deviceoptions>/<options> elements as XML text */
  optionsXml?: string[];
  /** per-device settings: <deviceoptions> (deadzone/saturation per axis) and <options> (invert/exponent/curve per option group) */
  settings?: import('./devopts').DeviceSettings;
  /** rebinds as originally imported, for "revert to imported" */
  original?: RebindMap;
  /** true when created in the app rather than imported */
  local?: boolean;
  editedAt?: string;
}

export interface Binding {
  slot: Slot;
  instance: number;
  input: string;
  mode?: string;
  multiTap?: number;
  custom: boolean;
  devices: Device[];
  /** physical identity of the input, used for conflicts */
  phys: string;
}

export interface Row {
  id: string;
  map: string;
  mapLabel: string;
  group: string;
  action: string;
  label: string;
  desc?: string;
  mode?: string;
  hidden: boolean;
  unlisted: boolean;
  bindings: Binding[];
  /** device columns whose default binding was removed by the profile */
  cleared: Device[];
  customized: boolean;
  order: number;
  defaults: DefaultBinding[];
}
