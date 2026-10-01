import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { adminAccount } from './admin.js';

export const auditSchema = pgSchema('audit');

export const auditChainHead = auditSchema.table('audit_chain_head', {
  headHash: varchar('head_hash', { length: 64 }).notNull(),
  sequence: bigint('sequence', { mode: 'number' }).notNull(),
  streamId: varchar('stream_id', { length: 160 }).primaryKey(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
});

export const auditEvent = auditSchema.table(
  'audit_event',
  {
    actorId: uuid('actor_id'),
    actorType: varchar('actor_type', { length: 16 }).notNull(),
    aggregateId: uuid('aggregate_id'),
    aggregateType: varchar('aggregate_type', { length: 48 }),
    eventHash: varchar('event_hash', { length: 64 }).notNull(),
    eventType: varchar('event_type', { length: 80 }).notNull(),
    eventVersion: integer('event_version').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true }).notNull(),
    payload: jsonb('payload').notNull(),
    payloadDigest: varchar('payload_digest', { length: 64 }).notNull(),
    previousHash: varchar('previous_hash', { length: 64 }).notNull(),
    sequence: bigserial('sequence', { mode: 'number' }).notNull(),
    streamId: varchar('stream_id', { length: 160 }).notNull(),
  },
  (table) => [
    check(
      'audit_event_actor_type_check',
      sql`${table.actorType} IN ('ADMIN', 'SYSTEM', 'ANONYMOUS')`,
    ),
    check('audit_event_event_version_check', sql`${table.eventVersion} > 0`),
    check('audit_event_payload_digest_check', sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`),
    check('audit_event_previous_hash_check', sql`${table.previousHash} ~ '^[0-9a-f]{64}$'`),
    check('audit_event_event_hash_check', sql`${table.eventHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'audit_event_anonymous_actor_check',
      sql`${table.actorType} <> 'ANONYMOUS' OR ${table.actorId} IS NULL`,
    ),
    uniqueIndex('audit_event_sequence_unique').on(table.sequence),
    index('audit_event_stream_sequence_idx').on(table.streamId, table.sequence),
    index('audit_event_aggregate_idx').on(table.aggregateType, table.aggregateId, table.sequence),
  ],
);

export const auditCheckpoint = auditSchema.table(
  'audit_checkpoint',
  {
    checkpointVersion: varchar('checkpoint_version', { length: 48 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    fromSequence: bigint('from_sequence', { mode: 'number' }).notNull(),
    headHash: varchar('head_hash', { length: 64 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    streamId: varchar('stream_id', { length: 160 }).notNull(),
    toSequence: bigint('to_sequence', { mode: 'number' }).notNull(),
  },
  (table) => [
    check(
      'audit_checkpoint_range_check',
      sql`${table.fromSequence} > 0 AND ${table.toSequence} >= ${table.fromSequence}`,
    ),
    check('audit_checkpoint_head_hash_check', sql`${table.headHash} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex('audit_checkpoint_stream_head_unique').on(
      table.streamId,
      table.toSequence,
      table.headHash,
    ),
  ],
);

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
