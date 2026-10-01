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
    configurationVersion: integer('configuration_version').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    tally: jsonb('tally').notNull(),
    tallyVersion: varchar('tally_version', { length: 48 }).notNull(),
  },
  (table) => [
    uniqueIndex('tally_manifests_election_config_unique').on(
      table.electionId,
      table.configurationVersion,
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
    packagePath: varchar('package_path', { length: 1_000 }).notNull(),
    packageVersion: varchar('package_version', { length: 48 }).notNull(),
    verificationReport: jsonb('verification_report').notNull(),
  },
  (table) => [
    uniqueIndex('verification_packages_election_config_unique').on(
      table.electionId,
      table.configurationVersion,
    ),
    uniqueIndex('verification_packages_content_digest_unique').on(table.contentDigest),
  ],
);
