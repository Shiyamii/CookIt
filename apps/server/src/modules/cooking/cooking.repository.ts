import type { CookState } from '@cookit/shared';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { cookSessions, timers } from './cooking.schema';

export type CookSessionRow = { version: number; updatedAt: Date; state: CookState };

export type CookingRepository = {
  /** The user's active session, if any. */
  findActive(userId: string): Promise<CookSessionRow | undefined>;
  /**
   * Saves the state of the user's active session (created if there is none) and mirrors its
   * timers; returns the new version.
   */
  save(userId: string, state: CookState, options: { now: Date; newId: string }): Promise<number>;
  /**
   * Changes the active session's state in one transaction (row locked): `change` gets the
   * current state and returns the new one, or undefined to change nothing. A save from another
   * device cannot be lost in between. Returns whether something changed.
   */
  change(
    userId: string,
    change: (state: CookState) => CookState | undefined,
    now: Date,
  ): Promise<boolean>;
  /** Ends the active session: deleted with its timers (nothing to keep, nothing to notify). */
  end(userId: string, now: Date): Promise<boolean>;
};

const active = (userId: string) =>
  and(eq(cookSessions.userId, userId), isNull(cookSessions.endedAt));

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The `timers` rows follow the state's timers (for the notification scheduler). */
async function mirrorTimers(tx: Transaction, sessionId: string, state: CookState, now: Date) {
  const ids = state.timers.map((timer) => timer.id);
  await tx
    .delete(timers)
    .where(
      and(eq(timers.cookSessionId, sessionId), ids.length ? notInArray(timers.id, ids) : undefined),
    );
  if (state.timers.length) {
    await tx
      .insert(timers)
      .values(
        state.timers.map((timer) => ({
          cookSessionId: sessionId,
          id: timer.id,
          recipeId: timer.recipeId,
          recipeTitle: timer.recipeTitle,
          label: timer.label,
          durationSeconds: timer.durationSeconds,
          endsAt: new Date(timer.endsAt),
          createdAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: [timers.cookSessionId, timers.id],
        set: {
          recipeTitle: sql`excluded.recipe_title`,
          label: sql`excluded.label`,
          durationSeconds: sql`excluded.duration_seconds`,
          endsAt: sql`excluded.ends_at`,
          // A new end time (+1 min) is a new notification to send.
          status: sql`case when ${timers.endsAt} = excluded.ends_at then ${timers.status} else 'running' end`,
          notifiedAt: sql`case when ${timers.endsAt} = excluded.ends_at then ${timers.notifiedAt} else null end`,
          sends: sql`case when ${timers.endsAt} = excluded.ends_at then ${timers.sends} else 0 end`,
          claimedAt: sql`case when ${timers.endsAt} = excluded.ends_at then ${timers.claimedAt} else null end`,
        },
      });
  }
}

export function createCookingRepository(db: Database): CookingRepository {
  return {
    async findActive(userId) {
      const [row] = await db
        .select({
          version: cookSessions.version,
          updatedAt: cookSessions.updatedAt,
          state: cookSessions.state,
        })
        .from(cookSessions)
        .where(active(userId));
      return row;
    },

    save(userId, state, options) {
      return db.transaction(async (tx) => {
        // Two first saves at once: the unique index keeps one, both then update it.
        await tx
          .insert(cookSessions)
          .values({
            id: options.newId,
            userId,
            state,
            version: 0,
            createdAt: options.now,
            updatedAt: options.now,
          })
          .onConflictDoNothing();
        const [session] = await tx
          .select({ id: cookSessions.id })
          .from(cookSessions)
          .where(active(userId))
          .for('update');
        if (!session) throw new Error('No active cooking session');
        const [updated] = await tx
          .update(cookSessions)
          .set({ state, version: sql`${cookSessions.version} + 1`, updatedAt: options.now })
          .where(eq(cookSessions.id, session.id))
          .returning({ version: cookSessions.version });

        await mirrorTimers(tx, session.id, state, options.now);
        return updated?.version ?? 1;
      });
    },

    change(userId, change, now) {
      return db.transaction(async (tx) => {
        const [session] = await tx
          .select({ id: cookSessions.id, state: cookSessions.state })
          .from(cookSessions)
          .where(active(userId))
          .for('update');
        const next = session && change(session.state);
        if (!session || !next) return false;
        await tx
          .update(cookSessions)
          .set({ state: next, version: sql`${cookSessions.version} + 1`, updatedAt: now })
          .where(eq(cookSessions.id, session.id));
        await mirrorTimers(tx, session.id, next, now);
        return true;
      });
    },

    // A deleted row rather than `ended_at`: ended sessions would pile up (a loop of start and
    // stop) and nothing reads them. Timers go with it (cascade).
    async end(userId) {
      const deleted = await db
        .delete(cookSessions)
        .where(active(userId))
        .returning({ id: cookSessions.id });
      return deleted.length > 0;
    },
  };
}
