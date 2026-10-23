import {
  MAX_TIMER_SECONDS,
  type CookSession,
  type CookSessionResponse,
  type CookState,
} from '@cookit/shared';
import type { CookingRepository } from './cooking.repository';

/** A timer whose end time cannot be real (far in the past or the future). */
export type InvalidTimer = { error: 'invalid_timer' };

/** A finished timer stays in the state until dismissed; older than this, it cannot be one. */
const PAST_LIMIT_MS = 24 * 3600 * 1000;
/** Margin for the client's clock (corrected, but offline starts use the device time). */
const FUTURE_MARGIN_MS = 3600 * 1000;

/**
 * Cooking sessions (plan §5.3): the client sends the whole state at every event, the last save
 * wins. The state only holds the user's own choices (recipe ids, steps, timers): recipes are read
 * through the recipes API, with its access rules.
 */
export function createCookingService(deps: {
  repository: CookingRepository;
  now?: () => Date;
  newId?: () => string;
}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return {
    async get(userId: string): Promise<CookSessionResponse> {
      const row = await deps.repository.findActive(userId);
      const session: CookSession | null = row
        ? { version: row.version, updatedAt: row.updatedAt.toISOString(), state: row.state }
        : null;
      return { session, serverNow: now().toISOString() };
    },

    async save(
      userId: string,
      state: CookState,
    ): Promise<{ version: number; serverNow: string } | InvalidTimer> {
      const at = now();
      const earliest = at.getTime() - PAST_LIMIT_MS;
      const latest = at.getTime() + MAX_TIMER_SECONDS * 1000 + FUTURE_MARGIN_MS;
      const valid = state.timers.every((timer) => {
        const endsAt = Date.parse(timer.endsAt);
        return endsAt >= earliest && endsAt <= latest;
      });
      if (!valid) return { error: 'invalid_timer' };
      // Stored in a canonical form (UTC), whatever offset the client wrote.
      const canonical: CookState = {
        items: state.items,
        timers: state.timers.map((timer) => ({
          ...timer,
          endsAt: new Date(timer.endsAt).toISOString(),
        })),
      };
      const version = await deps.repository.save(userId, canonical, { now: at, newId: newId() });
      return { version, serverNow: at.toISOString() };
    },

    /**
     * "Stop" from a notification: the finished timer leaves the session (like dismissing it in
     * the app), so its reminders stop. Nothing for a timer still running or already gone.
     */
    async stopTimer(userId: string, timerId: string): Promise<{ ok: true; serverNow: string }> {
      const at = now();
      await deps.repository.change(
        userId,
        (state) => {
          const timer = state.timers.find((item) => item.id === timerId);
          if (!timer || Date.parse(timer.endsAt) > at.getTime()) return undefined;
          return { items: state.items, timers: state.timers.filter((item) => item.id !== timerId) };
        },
        at,
      );
      return { ok: true, serverNow: at.toISOString() };
    },

    async end(userId: string): Promise<{ ok: true; serverNow: string }> {
      const at = now();
      await deps.repository.end(userId, at);
      return { ok: true, serverNow: at.toISOString() };
    },
  };
}

export type CookingService = ReturnType<typeof createCookingService>;
