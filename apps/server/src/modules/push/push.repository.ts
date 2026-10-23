import { and, asc, eq, isNull, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { user } from '../auth/auth.schema';
import { MAX_TIMER_REMINDERS, TIMER_REMINDER_SECONDS } from '@cookit/shared';
import { cookSessions, timers } from '../cooking/cooking.schema';
import { alarmSettings } from '../profile/profile.schema';
import { pushSubscriptions } from './push.schema';

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  createdAt: Date;
};

/** A timer whose end has come and that was not notified yet, with what the notification needs. */
export type DueTimer = {
  cookSessionId: string;
  id: string;
  userId: string;
  recipeId: string | null;
  recipeTitle: string;
  label: string;
  endsAt: Date;
  createdAt: Date;
  locale: string;
  userDisabled: boolean;
  /** Notifications already sent for this end time (0: the first is due). */
  sends: number;
  /** The account wants reminders until the timer is stopped. */
  repeat: boolean;
};

export type PushRepository = {
  /**
   * Saves a browser's subscription for the user. A row of another user is only taken over with
   * the same keys: the browser itself, now signed in with another account (knowing an endpoint
   * is not enough to take someone's notifications away).
   */
  upsert(
    userId: string,
    subscription: Omit<StoredSubscription, 'id' | 'createdAt'>,
    options: { now: Date; newId: string },
  ): Promise<void>;
  /** Keeps the user's `keep` most recent subscriptions. */
  prune(userId: string, keep: number): Promise<void>;
  list(userId: string): Promise<StoredSubscription[]>;
  delete(userId: string, endpoint: string): Promise<boolean>;
  /** A dead subscription (the push service answered 404/410). */
  deleteById(id: string): Promise<void>;
  /**
   * Claims the timers due at the database time, not claimed by another run within
   * `leaseSeconds` (`FOR UPDATE SKIP LOCKED`, then committed at once: no lock is held while
   * sending). A claim never confirmed (crash) expires and the timer is sent by a later run.
   */
  claimDue(limit: number, leaseSeconds: number): Promise<DueTimer[]>;
  /**
   * Sent (or skipped): one more send counted; `final` ones become `done`, the others wait for
   * their next reminder. Unless the end time changed meanwhile (+1 min: a new notification).
   */
  markNotified(sent: { timer: DueTimer; final: boolean }[]): Promise<void>;
  /** Not sent this run: claimable again at once. */
  release(timers: DueTimer[]): Promise<void>;
};

export function createPushRepository(db: Database): PushRepository {
  const columns = {
    id: pushSubscriptions.id,
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    userAgent: pushSubscriptions.userAgent,
    createdAt: pushSubscriptions.createdAt,
  };

  return {
    async upsert(userId, subscription, options) {
      await db
        .insert(pushSubscriptions)
        .values({ id: options.newId, userId, ...subscription, createdAt: options.now })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          setWhere: or(
            eq(pushSubscriptions.userId, userId),
            and(
              eq(pushSubscriptions.p256dh, subscription.p256dh),
              eq(pushSubscriptions.auth, subscription.auth),
            ),
          ),
          set: {
            userId,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            userAgent: subscription.userAgent,
            createdAt: options.now,
          },
        });
    },

    async prune(userId, keep) {
      const kept = db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .orderBy(sql`${pushSubscriptions.createdAt} desc`)
        .limit(keep);
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), notInArray(pushSubscriptions.id, kept)));
    },

    list(userId) {
      return db
        .select(columns)
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId))
        .orderBy(asc(pushSubscriptions.createdAt));
    },

    async delete(userId, endpoint) {
      const deleted = await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
        .returning({ id: pushSubscriptions.id });
      return deleted.length > 0;
    },

    async deleteById(id) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
    },

    claimDue(limit, leaseSeconds) {
      return db.transaction(async (tx) => {
        const due = await tx
          .select({
            cookSessionId: timers.cookSessionId,
            id: timers.id,
            userId: cookSessions.userId,
            recipeId: timers.recipeId,
            recipeTitle: timers.recipeTitle,
            label: timers.label,
            endsAt: timers.endsAt,
            createdAt: timers.createdAt,
            locale: user.locale,
            disabledAt: user.disabledAt,
            sends: timers.sends,
            // No settings saved: the defaults (reminders on).
            repeat: sql<boolean>`coalesce((${alarmSettings.settings}->>'repeat')::boolean, true)`,
          })
          .from(timers)
          .innerJoin(cookSessions, eq(cookSessions.id, timers.cookSessionId))
          .innerJoin(user, eq(user.id, cookSessions.userId))
          .leftJoin(alarmSettings, eq(alarmSettings.userId, cookSessions.userId))
          .where(
            and(
              eq(timers.status, 'running'),
              lte(timers.endsAt, sql`now()`),
              // The first notification, or a reminder whose time has come.
              or(
                isNull(timers.notifiedAt),
                and(
                  lte(timers.sends, MAX_TIMER_REMINDERS),
                  lte(
                    timers.notifiedAt,
                    sql`now() - make_interval(secs => ${TIMER_REMINDER_SECONDS})`,
                  ),
                ),
              ),
              or(
                isNull(timers.claimedAt),
                lt(timers.claimedAt, sql`now() - make_interval(secs => ${leaseSeconds})`),
              ),
            ),
          )
          .orderBy(asc(timers.endsAt))
          .limit(limit)
          .for('update', { of: timers, skipLocked: true });
        for (const timer of due) {
          await tx
            .update(timers)
            .set({ claimedAt: sql`now()` })
            .where(and(eq(timers.cookSessionId, timer.cookSessionId), eq(timers.id, timer.id)));
        }
        return due.map(({ disabledAt, ...timer }) => ({
          ...timer,
          userDisabled: disabledAt !== null,
        }));
      });
    },

    async markNotified(sent) {
      for (const { timer, final } of sent) {
        await db
          .update(timers)
          .set({
            ...(final && { status: 'done' as const }),
            notifiedAt: sql`now()`,
            sends: sql`${timers.sends} + 1`,
            claimedAt: null,
          })
          .where(
            and(
              eq(timers.cookSessionId, timer.cookSessionId),
              eq(timers.id, timer.id),
              eq(timers.endsAt, timer.endsAt),
            ),
          );
      }
    },

    async release(due) {
      for (const timer of due) {
        await db
          .update(timers)
          .set({ claimedAt: null })
          .where(and(eq(timers.cookSessionId, timer.cookSessionId), eq(timers.id, timer.id)));
      }
    },
  };
}
