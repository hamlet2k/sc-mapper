export const HOLD_MS = 350;
/** Pure gesture decisions; the component owns pointer capture and recognition. */
export function micDown(listening: boolean, at: number) {
  return { startedHere: !listening, at };
}
export function micUp(press: ReturnType<typeof micDown>, at: number): 'stop' | 'keep' {
  return !press.startedHere || at - press.at >= HOLD_MS ? 'stop' : 'keep';
}
