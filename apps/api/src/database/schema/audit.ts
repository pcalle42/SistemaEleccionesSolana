import { index, pgSchema, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { adminAccount } from './admin.js';

export const auditSchema = pgSchema('audit');

export const adminAuthEvent = auditSchema.table(
  'admin_auth_event',
  {
    adminId: uuid('admin_id').references(() => adminAccount.id, { onDelete: 'set null' }),
    event: varchar('event', { length: 48 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    outcome: varchar('outcome', { length: 24 }).notNull(),
    requestId: varchar('request_id', { length: 64 }),
  },
  (table) => [
    index('admin_auth_event_admin_time_idx').on(table.adminId, table.occurredAt),
    index('admin_auth_event_event_time_idx').on(table.event, table.occurredAt),
  ],
);
