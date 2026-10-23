import { sql } from 'drizzle-orm';
import type { AlarmSettings } from '@cookit/shared';
import { check, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { bytea } from '../../db/types';
import { user } from '../auth/auth.schema';

/**
 * Profile pictures (phase 9c): at most one per user. `user.image` holds its URL; a new picture
 * gets a new id (and URL), so a URL always shows the same picture.
 */
export const avatars = pgTable(
  'avatars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    data: bytea('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('avatars_type_check', sql`${table.contentType} in ('image/webp', 'image/jpeg')`),
  ],
);

/** The alarm of finished timers, for the account (a device can override it locally). */
export const alarmSettings = pgTable('alarm_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<AlarmSettings>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
