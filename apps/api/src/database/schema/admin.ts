import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const adminSchema = pgSchema('admin');

export const adminAccount = adminSchema.table(
  'admin_account',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    passwordChangedAt: timestamp('password_changed_at', {
      mode: 'date',
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    passwordHash: text('password_hash').notNull(),
    singletonKey: boolean('singleton_key').default(true).notNull(),
    status: varchar('status', { length: 16 }).default('active').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    username: varchar('username', { length: 64 }).notNull(),
  },
  (table) => [
    check('admin_account_singleton_key_check', sql`${table.singletonKey} = true`),
    check('admin_account_status_check', sql`${table.status} IN ('active', 'inactive')`),
    uniqueIndex('admin_account_singleton_key_unique').on(table.singletonKey),
    uniqueIndex('admin_account_username_unique').on(table.username),
  ],
);
