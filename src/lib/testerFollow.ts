// Input tester "follow": which input was just pressed or moved (rising edges only, so a held button or a noisy axis
// doesn't keep firing), and whether to scroll to it (throttled, and never right after the user scrolled by hand).
import { hatDirection, isHatRest } from './capture';

export type FollowHit = { kind: 'button' | 'axis' | 'hat'; index: number };
interface DevState { btn: boolean[]; axisOn: boolean[]; hat: (string | null)[] }

/** an axis counts as moved past ON from its rest position, and is re-armed only once it is back within OFF (hysteresis) */
export const FOLLOW_AXIS_ON = 0.5, FOLLOW_AXIS_OFF = 0.2;

export class TesterFollow {
  private devs = new Map<string, DevState>();
  /** one poll of one device; returns the first new press / move, if any (the first poll of a device only records its state) */
  update(key: string, buttons: readonly boolean[], axes: readonly number[], rest?: readonly number[]): FollowHit | null {
    const prev = this.devs.get(key);
    const cur: DevState = { btn: [...buttons], axisOn: [], hat: [] };
    let hit: FollowHit | null = null;
    axes.forEach((v, i) => {
      const r = rest?.[i];
      if (r !== undefined && isHatRest(r)) {
        const d = isHatRest(v) ? null : hatDirection(v) ?? null;
        cur.hat[i] = d; cur.axisOn[i] = false;
        if (prev && d && d !== prev.hat[i]) hit ??= { kind: 'hat', index: i };
        return;
      }
      cur.hat[i] = null;
      const dist = r === undefined ? 0 : Math.abs(v - r);
      const was = prev?.axisOn[i] ?? false;
      cur.axisOn[i] = was ? dist > FOLLOW_AXIS_OFF : dist >= FOLLOW_AXIS_ON;
      if (prev && !was && cur.axisOn[i]) hit ??= { kind: 'axis', index: i };
    });
    if (prev) {
      const b = buttons.findIndex((p, i) => p && !prev.btn[i]);
      if (b >= 0) hit = { kind: 'button', index: b }; // a button press wins over an axis that moved in the same poll
    }
    this.devs.set(key, cur);
    return hit;
  }
}

/** after a scroll to a device, wait this long before scrolling again; after the user scrolled by hand, this long */
export const FOLLOW_SCROLL_GAP_MS = 700, FOLLOW_USER_PAUSE_MS = 2000;
/** scroll to a hit only when it is out of sight, not too soon after the last automatic scroll, and not while the user scrolls */
export function shouldFollowScroll(o: { now: number; visible: boolean; lastScrollAt: number; userScrollAt: number }): boolean {
  return !o.visible && o.now - o.lastScrollAt >= FOLLOW_SCROLL_GAP_MS && o.now - o.userScrollAt >= FOLLOW_USER_PAUSE_MS;
}
