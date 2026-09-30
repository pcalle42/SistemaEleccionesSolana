import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgSchema,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { elections } from './election.js';

export const eligibilitySchema = pgSchema('eligibility');

export const eligibleVoters = eligibilitySchema.table(
  'eligible_voters',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    displayName: varchar('display_name', { length: 200 }),
    externalReference: varchar('external_reference', { length: 128 }),
    id: uuid('id').primaryKey(),
    rowVersion: integer('row_version').default(0).notNull(),
    status: varchar('status', { length: 16 }).default('ACTIVE').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    check('eligible_voters_row_version_check', sql`${table.rowVersion} >= 0`),
    check(
      'eligible_voters_status_check',
      sql`${table.status} IN ('ACTIVE', 'INACTIVE', 'REVOKED')`,
    ),
    uniqueIndex('eligible_voters_external_reference_unique')
      .on(table.externalReference)
      .where(sql`${table.externalReference} IS NOT NULL`),
    index('eligible_voters_status_idx').on(table.status),
  ],
);

export const electoralCredentials = eligibilitySchema.table(
  'electoral_credentials',
  {
    activatedAt: timestamp('activated_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    eligibleVoterId: uuid('eligible_voter_id')
      .notNull()
      .references(() => eligibleVoters.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey(),
    identityCommitment: varchar('identity_commitment', { length: 256 }).notNull(),
    revokedAt: timestamp('revoked_at', { mode: 'date', withTimezone: true }),
    rowVersion: integer('row_version').default(0).notNull(),
    schemeVersion: varchar('scheme_version', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).default('PENDING').notNull(),
  },
  (table) => [
    check('electoral_credentials_row_version_check', sql`${table.rowVersion} >= 0`),
    check(
      'electoral_credentials_status_check',
      sql`${table.status} IN ('PENDING', 'ACTIVE', 'REVOKED', 'ROTATED')`,
    ),
    uniqueIndex('electoral_credentials_commitment_scheme_unique').on(
      table.identityCommitment,
      table.schemeVersion,
    ),
    uniqueIndex('electoral_credentials_one_active_per_voter')
      .on(table.eligibleVoterId)
      .where(sql`${table.status} = 'ACTIVE'`),
    index('electoral_credentials_status_commitment_idx').on(
      table.status,
      table.schemeVersion,
      table.identityCommitment,
    ),
  ],
);

export const eligibilitySnapshots = eligibilitySchema.table(
  'eligibility_snapshots',
  {
    commitmentSchemeVersion: varchar('commitment_scheme_version', { length: 64 }).notNull(),
    configurationVersion: integer('configuration_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    frozenAt: timestamp('frozen_at', { mode: 'date', withTimezone: true }),
    id: uuid('id').primaryKey(),
    leafCount: integer('leaf_count').notNull(),
    merkleRoot: varchar('merkle_root', { length: 256 }).notNull(),
    rowVersion: integer('row_version').default(0).notNull(),
    status: varchar('status', { length: 16 }).default('BUILDING').notNull(),
    treeDepth: integer('tree_depth').notNull(),
    version: integer('version').notNull(),
  },
  (table) => [
    check(
      'eligibility_snapshots_configuration_version_check',
      sql`${table.configurationVersion} > 0`,
    ),
    check('eligibility_snapshots_version_check', sql`${table.version} > 0`),
    check('eligibility_snapshots_leaf_count_check', sql`${table.leafCount} > 0`),
    check('eligibility_snapshots_tree_depth_check', sql`${table.treeDepth} > 0`),
    check('eligibility_snapshots_row_version_check', sql`${table.rowVersion} >= 0`),
    check(
      'eligibility_snapshots_status_check',
      sql`${table.status} IN ('BUILDING', 'FROZEN', 'SUPERSEDED')`,
    ),
    uniqueIndex('eligibility_snapshots_election_config_version_unique').on(
      table.electionId,
      table.configurationVersion,
      table.version,
    ),
    uniqueIndex('eligibility_snapshots_one_frozen_per_config')
      .on(table.electionId, table.configurationVersion)
      .where(sql`${table.status} = 'FROZEN'`),
    index('eligibility_snapshots_election_status_idx').on(table.electionId, table.status),
  ],
);

export const eligibilitySnapshotMembers = eligibilitySchema.table(
  'eligibility_snapshot_members',
  {
    credentialId: uuid('credential_id')
      .notNull()
      .references(() => electoralCredentials.id, { onDelete: 'restrict' }),
    leafIndex: integer('leaf_index').notNull(),
    leafValue: varchar('leaf_value', { length: 256 }).notNull(),
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => eligibilitySnapshots.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.credentialId] }),
    check('eligibility_snapshot_members_leaf_index_check', sql`${table.leafIndex} >= 0`),
    uniqueIndex('eligibility_snapshot_members_leaf_index_unique').on(
      table.snapshotId,
      table.leafIndex,
    ),
    uniqueIndex('eligibility_snapshot_members_leaf_value_unique').on(
      table.snapshotId,
      table.leafValue,
    ),
  ],
);
