import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { extendTimer, removeTimer } from '@/features/cooking/model/session';
import { cookSyncFor } from '@/features/cooking/model/store';
import { ring, unlockAlarm } from '../model/player';
import { GIVE_UP_MS, shouldRing } from '../model/schedule';
import { soundDuration } from '../model/sounds';
import { useAlarmSettings } from './useAlarmSettings';

const noSubscription = () => () => undefined;

/**
 * The alarm of finished timers, on every page while signed in: rings like an alarm clock (again
 * and again, then every 30 s, then gives up after 15 min) until stopped, or once without repeat.
 * "Stop" dismisses the finished timers (their notifications stop too); "+1 min" re-arms one.
 */
export function useAlarmViewModel() {
  const { user } = useSession();
  const sync = user ? cookSyncFor(user.id) : undefined;
  const snapshot = useSyncExternalStore(sync?.subscribe ?? noSubscription, () =>
    sync?.getSnapshot(),
  );
  const { effective } = useAlarmSettings();
  const timers = snapshot?.state?.timers ?? [];
  const offset = snapshot?.offset ?? 0;

  // Sound needs a user gesture first: the first touch of any page unlocks it.
  useEffect(() => {
    const unlock = () => unlockAlarm();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // The cooking session of another page or device: read it when this one opens.
  useEffect(() => {
    void sync?.refresh();
  }, [sync]);

  // A clock while timers run (a second is enough: rings are seconds apart).
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  const running = timers.length > 0;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setDeviceNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const now = deviceNow + offset;

  const finished = timers.filter((timer) => Date.parse(timer.endsAt) <= now);
  const lastFinished = Math.max(...finished.map((timer) => Date.parse(timer.endsAt)));
  const finishedKey = finished.map((timer) => `${timer.id}@${timer.endsAt}`).join(',');

  // One ringing for all finished timers; another timer finishing starts it again.
  const episode = useRef<{ key: string; start: number; last?: number }>(undefined);
  const soundMs = soundDuration(effective.sound);
  useEffect(() => {
    if (!finishedKey) {
      episode.current = undefined;
      return;
    }
    if (episode.current?.key !== finishedKey) {
      // Timers that finished long ago (a page opened much later) do not start ringing.
      const stale = now - lastFinished >= GIVE_UP_MS;
      episode.current = { key: finishedKey, start: stale ? now - GIVE_UP_MS : now };
    }
    if (document.visibilityState !== 'visible') return;
    const current = episode.current;
    if (
      shouldRing({
        now,
        finishedAt: current.start,
        lastRingAt: current.last,
        soundMs,
        repeat: effective.repeat,
      })
    ) {
      ring(effective);
      current.last = now;
    }
  }, [finishedKey, lastFinished, now, soundMs, effective]);

  return {
    finished: finished.map((timer) => ({
      id: timer.id,
      title: timer.recipeTitle,
      label: timer.label,
      recipeId: timer.recipeId,
    })),
    stop: () =>
      sync?.update((state) =>
        finished.reduce((current, timer) => removeTimer(current, timer.id), state),
      ),
    addMinute: (id: string) => {
      unlockAlarm();
      sync?.update((state) => extendTimer(state, id, 60, Date.now() + offset));
    },
  };
}
