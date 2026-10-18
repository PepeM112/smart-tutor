/** Whole seconds left until `deadline`, never below 0. Rounded up, so "0:01" shows until the last moment. */
export function secondsLeft(deadline: Date, now: number): number {
  return Math.max(0, Math.ceil((deadline.getTime() - now) / 1000));
}

/** `m:ss`, or `h:mm:ss` from one hour. */
export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}
