/**
 * When the alarm rings again, like an alarm clock: right after the sound (a short pause) during
 * the first minutes, then every 30 seconds, then it gives up (nobody is there).
 */

/** Rings in a loop during this time after the first timer finished. */
export const LOOP_MS = 5 * 60 * 1000;
/** Then once every `SLOW_EVERY_MS`, until `GIVE_UP_MS`. */
export const SLOW_EVERY_MS = 30 * 1000;
export const GIVE_UP_MS = 15 * 60 * 1000;
/** The pause between two sounds of the loop. */
export const PAUSE_MS = 1500;

/**
 * The time to wait after a ring before the next one, `sinceFinishedMs` after the timer finished;
 * undefined: no more ringing.
 */
export function nextRingDelay(sinceFinishedMs: number, soundMs: number): number | undefined {
  if (sinceFinishedMs >= GIVE_UP_MS) return undefined;
  return sinceFinishedMs < LOOP_MS ? soundMs + PAUSE_MS : SLOW_EVERY_MS;
}

/**
 * Whether to ring now: never rung yet (and not given up), or the delay since the last ring has
 * passed. Without repeat, a timer rings once (when it finishes while a page is open).
 */
export function shouldRing(input: {
  now: number;
  finishedAt: number;
  lastRingAt: number | undefined;
  soundMs: number;
  repeat: boolean;
}): boolean {
  const since = input.now - input.finishedAt;
  if (since < 0 || since >= GIVE_UP_MS) return false;
  if (input.lastRingAt === undefined) return true;
  if (!input.repeat) return false;
  const delay = nextRingDelay(input.now - input.finishedAt, input.soundMs);
  return delay !== undefined && input.now - input.lastRingAt >= delay;
}
