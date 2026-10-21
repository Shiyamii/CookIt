import type { PushService } from './push.service';

/** Plan §5.4: a loop every ~5 s. */
export const SCHEDULER_INTERVAL_MS = 5000;

/**
 * Notification scheduler, started with the server (one process, no separate worker). Each run
 * reads the due timers from the database, so a restart loses none: timers that ended while the
 * server was down are sent at its first run. Runs never overlap.
 */
export function startPushScheduler(push: PushService, intervalMs = SCHEDULER_INTERVAL_MS) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const run = async () => {
    try {
      // A full batch: there may be more, go on at once.
      while (!stopped && (await push.notifyDue()) >= 50);
    } catch (error) {
      console.error('Push scheduler run failed:', error instanceof Error ? error.message : error);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  const tick = () => {
    running = run();
  };
  tick();

  return {
    /** Stops the loop and waits for the current run. */
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
