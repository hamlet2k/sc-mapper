/** Curated top-level grouping of Star Citizen action maps */
/** `icon`: name in the shared line-icon set (components/icons.tsx) */
export const GROUPS: { id: string; label: string; icon: string; maps: string[] }[] = [
  { id: 'flight', label: 'Flight & Ship Systems', icon: 'flight', maps: ['spaceship_movement', 'spaceship_quantum', 'spaceship_docking', 'spaceship_general', 'spaceship_view', 'spaceship_power', 'spaceship_hud', 'spaceship_radar', 'seat_general', 'vehicle_mfd', 'lights_controller', 'vehicle_mobiglas', 'stopwatch'] },
  { id: 'combat', label: 'Targeting & Combat', icon: 'combat', maps: ['spaceship_targeting', 'spaceship_targeting_advanced', 'spaceship_target_hailing', 'spaceship_weapons', 'spaceship_missiles', 'spaceship_defensive', 'spaceship_auto_weapons'] },
  { id: 'industry', label: 'Mining, Salvage & Scanning', icon: 'industry', maps: ['spaceship_mining', 'spaceship_salvage', 'spaceship_scanning'] },
  { id: 'turret', label: 'Turrets', icon: 'turret', maps: ['turret_movement', 'turret_advanced'] },
  { id: 'fps', label: 'On Foot (FPS)', icon: 'fps', maps: ['player', 'prone', 'incapacitated', 'tractor_beam', 'mining', 'hacking', 'player_emotes'] },
  { id: 'eva', label: 'EVA / Zero-G', icon: 'eva', maps: ['zero_gravity_eva', 'zero_gravity_traversal'] },
  { id: 'vehicle', label: 'Ground Vehicles', icon: 'vehicle', maps: ['vehicle_general', 'vehicle_driver'] },
  { id: 'social', label: 'Social, UI & Interaction', icon: 'social', maps: ['default', 'ui_notification', 'player_choice', 'player_input_optical_tracking', 'mapui', 'ui_textfield'] },
  { id: 'camera', label: 'Camera & Spectator', icon: 'camera', maps: ['view_director_mode', 'spectator', 'flycam'] },
  { id: 'internal', label: 'Internal / Dev', icon: 'internal', maps: ['debug', 'IFCS_controls', 'character_customizer', 'RemoteRigidEntityController', 'server_renderer'] },
  { id: 'unlisted', label: 'Unlisted (from import)', icon: 'unlisted', maps: [] },
];

const MAP_GROUP = new Map<string, string>();
GROUPS.forEach((g) => g.maps.forEach((m) => MAP_GROUP.set(m, g.id)));
export const groupOf = (map: string) => MAP_GROUP.get(map) ?? 'internal';
export const groupLabel = (id: string) => GROUPS.find((g) => g.id === id)?.label ?? id;

/** Which input context an action map is active in (for conflict detection) */
const CTX: Record<string, string> = {
  seat_general: 'seat', vehicle_mfd: 'seat', lights_controller: 'seat', vehicle_mobiglas: 'seat',
  spaceship_general: 'ship', spaceship_view: 'ship', spaceship_movement: 'ship', spaceship_quantum: 'ship',
  spaceship_docking: 'ship', spaceship_targeting: 'ship', spaceship_targeting_advanced: 'ship',
  spaceship_target_hailing: 'ship', spaceship_radar: 'ship', spaceship_hud: 'ship', spaceship_power: 'ship',
  spaceship_defensive: 'ship', spaceship_weapons: 'ship.combat', spaceship_missiles: 'ship.combat',
  spaceship_auto_weapons: 'ship.combat', spaceship_scanning: 'ship.scan', spaceship_mining: 'ship.mining',
  spaceship_salvage: 'ship.salvage', turret_movement: 'turret', turret_advanced: 'turret',
  player: 'fps', prone: 'fps.prone', incapacitated: 'fps.down', tractor_beam: 'fps.tractor', mining: 'fps.mining',
  hacking: 'fps.hack', player_emotes: 'fps', zero_gravity_eva: 'eva', zero_gravity_traversal: 'eva',
  vehicle_general: 'vehicle', vehicle_driver: 'vehicle', default: 'global', ui_notification: 'global',
  player_choice: 'global', player_input_optical_tracking: 'global', view_director_mode: 'camera', spectator: 'spectator',
};
export const contextOf = (map: string) => CTX[map] ?? `own:${map}`;

export function contextsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const [pa] = a.split('.');
  const [pb] = b.split('.');
  // parent context is active together with its sub-modes (e.g. ship + ship.mining)
  if ((a === pb && b.startsWith(a + '.')) || (b === pa && a.startsWith(b + '.'))) return true;
  // seat-level actions are active in ship / turret / ground vehicle seats
  if (a === 'seat') return ['ship', 'turret', 'vehicle'].includes(pb);
  if (b === 'seat') return ['ship', 'turret', 'vehicle'].includes(pa);
  return false;
}

/** Activation modes that can share an input without clashing (e.g. tap vs long-press) */
export function modeBucket(mode?: string): string {
  // tap, press, hold, toggle... all fire on a quick press, so they collide with each other
  if (!mode) return 'short';
  if (mode.startsWith('double_tap')) return 'double';
  if (mode.startsWith('delayed')) return mode.includes('long') ? 'delayed-long' : mode.includes('medium') ? 'delayed-medium' : 'delayed';
  return 'short';
}
