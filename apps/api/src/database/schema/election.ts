import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { adminAccount } from './admin.js';

export const electionSchema = pgSchema('election');

export const elections = electionSchema.table(
  'elections',
  {
    cancellationReason: text('cancellation_reason'),
    circuitVersion: varchar('circuit_version', { length: 64 }),
    closesAt: timestamp('closes_at', { mode: 'date', withTimezone: true }).notNull(),
    configurationVersion: integer('configuration_version').default(0).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    description: varchar('description', { length: 2_000 }),
    eligibilityConfigurationRef: varchar('eligibility_configuration_ref', { length: 128 }),
    id: uuid('id').primaryKey(),
    opensAt: timestamp('opens_at', { mode: 'date', withTimezone: true }).notNull(),
    protocolVersion: varchar('protocol_version', { length: 64 }),
    rowVersion: integer('row_version').default(0).notNull(),
    status: varchar('status', { length: 24 }).default('DRAFT').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
    votingMethod: varchar('voting_method', { length: 32 }).default('SINGLE_CHOICE').notNull(),
  },
  (table) => [
    check('elections_voting_window_check', sql`${table.opensAt} < ${table.closesAt}`),
    check('elections_configuration_version_check', sql`${table.configurationVersion} >= 0`),
    check('elections_row_version_check', sql`${table.rowVersion} >= 0`),
    check(
      'elections_status_check',
      sql`${table.status} IN ('DRAFT', 'READY', 'OPEN', 'CLOSED', 'COUNTING', 'RESULTS_PUBLISHED', 'CANCELLED')`,
    ),
    check('elections_voting_method_check', sql`${table.votingMethod} = 'SINGLE_CHOICE'`),
    index('elections_status_time_idx').on(table.status, table.opensAt, table.closesAt),
  ],
);

export const electionOptions = electionSchema.table(
  'election_options',
  {
    description: varchar('description', { length: 1_000 }),
    displayOrder: integer('display_order').notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    id: uuid('id').primaryKey(),
    label: varchar('label', { length: 200 }).notNull(),
  },
  (table) => [
    check('election_options_display_order_check', sql`${table.displayOrder} >= 0`),
    uniqueIndex('election_options_election_order_unique').on(table.electionId, table.displayOrder),
    index('election_options_election_idx').on(table.electionId),
  ],
);

export const electionConfigurationVersions = electionSchema.table(
  'election_configuration_versions',
  {
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    frozenAt: timestamp('frozen_at', { mode: 'date', withTimezone: true }).notNull(),
    snapshot: jsonb('snapshot').notNull(),
    version: integer('version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.electionId, table.version] }),
    check('election_configuration_versions_version_check', sql`${table.version} > 0`),
  ],
);

export const electionStateEvent = electionSchema.table(
  'election_state_event',
  {
    actorAdminId: uuid('actor_admin_id')
      .notNull()
      .references(() => adminAccount.id, { onDelete: 'restrict' }),
    configurationVersion: integer('configuration_version').notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    id: uuid('id').defaultRandom().primaryKey(),
    newState: varchar('new_state', { length: 24 }).notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true }).notNull(),
    previousState: varchar('previous_state', { length: 24 }).notNull(),
    reason: text('reason'),
    requestId: varchar('request_id', { length: 64 }),
  },
  (table) => [
    index('election_state_event_election_time_idx').on(table.electionId, table.occurredAt),
  ],
);
