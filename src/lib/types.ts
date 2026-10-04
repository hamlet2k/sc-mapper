export type Slot = 'kb' | 'mo' | 'js' | 'gp';
export type Device = 'keyboard' | 'mouse' | 'joystick' | 'gamepad';

export interface DefaultBinding { slot: Slot; input: string; mode?: string }
export interface DefaultAction { name: string; label: string; desc?: string; mode?: string; hidden?: boolean; d: DefaultBinding[] }
export interface DefaultMap { name: string; label: string; category: string; hidden?: boolean; actions: DefaultAction[] }
export interface DefaultsMeta {
  game: string; branch?: string; version?: string; buildDate?: string; channel?: string;
  source: string; sourceUrl: string; generated: string;
}
export interface DefaultsData { meta: DefaultsMeta; maps: DefaultMap[] }

export interface Rebind { slot: Slot; instance: number; input: string; mode?: string; multiTap?: number }
export interface ProfileDevice { slot: Slot; instance: number; product: string }
export interface Profile {
  id: string;
  name: string;
  fileName: string;
  importedAt: string;
  devices: ProfileDevice[];
  /** map name -> action name -> rebinds */
  rebinds: Record<string, Record<string, Rebind[]>>;
  rebindCount: number;
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
  cleared: Slot[];
  customized: boolean;
  order: number;
  defaults: DefaultBinding[];
}
