import type { CookState } from '@cookit/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';

/**
 * Cooking sessions (plan §3, §5.3): the whole state as JSONB, saved at every event, `version`
 * incremented by each save (last change wins). One active session per user (`ended_at` null).
 */
export const cookSessions = pgTable(
  'cook_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<CookState>().notNull(),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('cook_sessions_active_unique')
      .on(table.userId)
      .where(sql`${table.endedAt} is null`),
  ],
);

/**
 * The running timers of a session, mirrored from its state at every save, for the notification
 * scheduler (phase 8). An absolute `ends_at`, never a remaining time. Ids come from the client,
 * so they are only unique within their session.
 */
export const timers = pgTable(
  'timers',
  {
    cookSessionId: text('cook_session_id')
      .notNull()
      .references(() => cookSessions.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    // No foreign key: a timer outlives the recipe if it is deleted while cooking.
    recipeId: text('recipe_id'),
    recipeTitle: text('recipe_title').notNull().default(''),
    label: text('label').notNull().default(''),
    durationSeconds: integer('duration_seconds').notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status', { enum: ['running', 'done', 'cancelled'] })
      .notNull()
      .default('running'),
    // The last notification, and how many were sent: the first, then reminders until the
    // timer is stopped (removed from the session) or the account does not want them.
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    sends: integer('sends').notNull().default(0),
    // Taken by a scheduler run that is sending it; retried by a later run once the lease expires.
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.cookSessionId, table.id] }),
    index('timers_due_idx')
      .on(table.endsAt)
      .where(sql`${table.status} = 'running'`),
    check('timers_status_check', sql`${table.status} in ('running', 'done', 'cancelled')`),
  ],
);
