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

export const eligibilityEvent = auditSchema.table(
  'eligibility_event',
  {
    actorAdminId: uuid('actor_admin_id')
      .notNull()
      .references(() => adminAccount.id, { onDelete: 'restrict' }),
    entityId: uuid('entity_id').notNull(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    event: varchar('event', { length: 64 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    requestId: varchar('request_id', { length: 64 }),
  },
  (table) => [
    index('eligibility_event_entity_time_idx').on(
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
  ],
);
