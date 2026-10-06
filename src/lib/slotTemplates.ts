// Template of a game slot: the user's pick for it (pinned on its hardware or on the slot), else the automatic match from the
// slot's hardware (templates.ts pickTemplate, including the identical-device order guess).
import { identityKey, pickTemplate, type DeviceIdentity, type DeviceTemplate } from './templates';
import { pinnedTemplate, slotIdentity, type GameSlot, type PadIdentity, type SlotMap } from './slots';

export interface SlotTemplate {
  template: DeviceTemplate;
  how: 'chosen' | 'guessed' | 'matched' | 'fallback';
  ident: DeviceIdentity;
  /** id of the user's pick ('' = automatic) */
  pick: string;
  /** the pick came from the per-device picks saved before slots existed */
  legacy: boolean;
}
/** pin meaning "automatic" even where an old per-device pick exists (so choosing Automatic sticks) */
export const AUTO_TEMPLATE = 'auto';
export function resolveSlotTemplate(all: DeviceTemplate[], map: SlotMap, s: GameSlot, pad: PadIdentity | undefined, legacyPicks: Record<string, string> = {}): SlotTemplate {
  const ident = slotIdentity(s, pad);
  const pin = pinnedTemplate(map, s);
  const pinned = pin === AUTO_TEMPLATE ? undefined : pin;
  const legacyId = pin ? undefined : legacyPicks[identityKey(ident)];
  const r = pickTemplate(all, ident, pinned ?? legacyId);
  const pick = r.how === 'chosen' ? r.template.id : '';
  return { template: r.template, how: r.how, ident, pick, legacy: !pinned && !!legacyId && r.how === 'chosen' };
}
/** the automatic template for a slot (what "Automatic" in a picker stands for) */
export const autoSlotTemplate = (all: DeviceTemplate[], s: GameSlot, pad?: PadIdentity) => pickTemplate(all, slotIdentity(s, pad)).template;
