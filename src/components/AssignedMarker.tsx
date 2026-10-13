import { assignedByUser, type GameSlot, type SlotMap } from '../lib/slots';

export function AssignedMarker({ gs, map }: { gs: GameSlot; map: SlotMap }) {
  if (!assignedByUser(map, gs)) return null;
  const title = gs.unknown || !gs.gameProduct
    ? "Assigned by you; the game file doesn't name this device"
    : 'Assigned by you; overrides the match from the game file';
  return <span className="assigned-marker shrink-0 rounded border border-slate-600/50 px-1 font-mono text-[9px] font-normal text-slate-500"
    data-testid="assigned-marker" title={title}>assigned</span>;
}
