import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { USER_ROLES, user } from '../auth/auth.schema';

/**
 * Invitation links (the only way to create an account). The first-admin setup link is an invite
 * with the `admin` role and no creator. Only the token hash is stored.
 */
export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    role: text('role', { enum: USER_ROLES }).notNull().default('user'),
    // Null for the setup link generated at startup.
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    label: text('label'),
    // Where the link was emailed (pre-filled at sign-up), and in which language.
    email: text('email'),
    locale: text('locale'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invites_created_at_idx').on(table.createdAt),
    check('invites_role_check', sql`${table.role} in ('admin', 'user')`),
  ],
);
