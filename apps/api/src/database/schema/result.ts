import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgSchema,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { elections } from './election.js';

export const resultSchema = pgSchema('result');

export const electionManifests = resultSchema.table(
  'election_manifests',
  {
    configurationVersion: integer('configuration_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    manifest: jsonb('manifest').notNull(),
    manifestDigest: varchar('manifest_digest', { length: 64 }).notNull(),
    manifestVersion: varchar('manifest_version', { length: 48 }).notNull(),
    publicationState: varchar('publication_state', { length: 16 }).default('DRAFT').notNull(),
  },
  (table) => [
    uniqueIndex('election_manifests_election_config_unique').on(
      table.electionId,
      table.configurationVersion,
    ),
    uniqueIndex('election_manifests_digest_unique').on(table.manifestDigest),
    check('election_manifests_config_check', sql`${table.configurationVersion} > 0`),
    check(
      'election_manifests_publication_state_check',
      sql`${table.publicationState} IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')`,
    ),
  ],
);

export const acceptedVoteSetSnapshots = resultSchema.table(
  'accepted_vote_set_snapshots',
  {
    canonicalDigest: varchar('canonical_digest', { length: 64 }).notNull(),
    configurationVersion: integer('configuration_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    id: uuid('id').defaultRandom().primaryKey(),
    protocolVersion: varchar('protocol_version', { length: 64 }).notNull(),
    recordCount: integer('record_count').notNull(),
    snapshotVersion: varchar('snapshot_version', { length: 48 }).notNull(),
  },
  (table) => [
    uniqueIndex('accepted_vote_set_election_config_unique').on(
      table.electionId,
      table.configurationVersion,
    ),
    check('accepted_vote_set_record_count_check', sql`${table.recordCount} >= 0`),
  ],
);

export const tallyManifests = resultSchema.table(
  'tally_manifests',
  {
    acceptedVoteSetDigest: varchar('accepted_vote_set_digest', { length: 64 }).notNull(),
    acceptedVoteCount: integer('accepted_vote_count').notNull(),
    configurationVersion: integer('configuration_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    id: uuid('id').defaultRandom().primaryKey(),
    protocolVersion: varchar('protocol_version', { length: 64 }).notNull(),
    status: varchar('status', { length: 16 }).default('COMPUTED').notNull(),
    tally: jsonb('tally').notNull(),
    tallyDigest: varchar('tally_digest', { length: 64 }).notNull(),
    tallyVersion: varchar('tally_version', { length: 48 }).notNull(),
  },
  (table) => [
    uniqueIndex('tally_manifests_election_config_unique').on(
      table.electionId,
      table.configurationVersion,
    ),
    uniqueIndex('tally_manifests_digest_unique').on(table.tallyDigest),
    check('tally_manifests_accepted_count_check', sql`${table.acceptedVoteCount} >= 0`),
    check(
      'tally_manifests_status_check',
      sql`${table.status} IN ('COMPUTED', 'VALIDATED', 'PUBLISHED', 'SUPERSEDED')`,
    ),
  ],
);

export const electionResults = resultSchema.table(
  'election_results',
  {
    acceptedVoteSetDigest: varchar('accepted_vote_set_digest', { length: 64 }).notNull(),
    configurationVersion: integer('configuration_version').notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    id: uuid('id').defaultRandom().primaryKey(),
    previousResultDigest: varchar('previous_result_digest', { length: 64 }),
    protocolVersion: varchar('protocol_version', { length: 64 }).notNull(),
    publicationDigest: varchar('publication_digest', { length: 64 }).notNull(),
    publishedAt: timestamp('published_at', { mode: 'date', withTimezone: true }).notNull(),
    result: jsonb('result').notNull(),
    resultContentDigest: varchar('result_content_digest', { length: 64 }).notNull(),
    resultSchemaVersion: varchar('result_schema_version', { length: 48 }).notNull(),
    resultVersion: integer('result_version').notNull(),
    status: varchar('status', { length: 16 }).default('VALIDATED').notNull(),
    tallyDigest: varchar('tally_digest', { length: 64 }).notNull(),
    totalAcceptedVotes: integer('total_accepted_votes').notNull(),
    verificationPackageDigest: varchar('verification_package_digest', { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex('election_results_election_version_unique').on(
      table.electionId,
      table.resultVersion,
    ),
    uniqueIndex('election_results_content_digest_unique').on(table.resultContentDigest),
    uniqueIndex('election_results_publication_digest_unique').on(table.publicationDigest),
    check('election_results_version_check', sql`${table.resultVersion} > 0`),
    check('election_results_total_check', sql`${table.totalAcceptedVotes} >= 0`),
    check(
      'election_results_status_check',
      sql`${table.status} IN ('VALIDATED', 'PUBLISHED', 'SUPERSEDED')`,
    ),
  ],
);

export const resultPublications = resultSchema.table(
  'result_publications',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    failureCode: varchar('failure_code', { length: 80 }),
    id: uuid('id').defaultRandom().primaryKey(),
    packageContentDigest: varchar('package_content_digest', { length: 64 }),
    resultVersion: integer('result_version').notNull(),
    status: varchar('status', { length: 16 }).default('GENERATED').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('result_publications_election_version_unique').on(
      table.electionId,
      table.resultVersion,
    ),
    check('result_publications_version_check', sql`${table.resultVersion} > 0`),
    check(
      'result_publications_status_check',
      sql`${table.status} IN ('GENERATED', 'VERIFIED', 'PUBLISHING', 'PUBLISHED', 'FAILED')`,
    ),
  ],
);

export const verificationPackages = resultSchema.table(
  'verification_packages',
  {
    configurationVersion: integer('configuration_version').notNull(),
    contentDigest: varchar('content_digest', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    evidenceDigest: varchar('evidence_digest', { length: 64 }).notNull(),
    packagePath: varchar('package_path', { length: 1_000 }).notNull(),
    packageVersion: varchar('package_version', { length: 48 }).notNull(),
    resultVersion: integer('result_version').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: varchar('status', { length: 16 }).default('GENERATED').notNull(),
    verificationReport: jsonb('verification_report').notNull(),
    verifiedAt: timestamp('verified_at', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('verification_packages_election_result_unique').on(
      table.electionId,
      table.resultVersion,
    ),
    uniqueIndex('verification_packages_content_digest_unique').on(table.contentDigest),
    check('verification_packages_result_version_check', sql`${table.resultVersion} > 0`),
    check('verification_packages_size_check', sql`${table.sizeBytes} > 0`),
    check(
      'verification_packages_status_check',
      sql`${table.status} IN ('GENERATED', 'VERIFIED', 'PUBLISHED', 'FAILED')`,
    ),
  ],
);
