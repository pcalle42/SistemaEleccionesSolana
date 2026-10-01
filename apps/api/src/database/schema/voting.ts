import { sql } from 'drizzle-orm';
import {
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

import { elections } from './election.js';

export const votingSchema = pgSchema('voting');

export const acceptedVotes = votingSchema.table(
  'accepted_votes',
  {
    acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true }).notNull(),
    circuitVersion: varchar('circuit_version', { length: 64 }).notNull(),
    configurationVersion: integer('configuration_version').notNull(),
    electionId: uuid('election_id')
      .notNull()
      .references(() => elections.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey(),
    nullifier: varchar('nullifier', { length: 80 }).notNull(),
    protocolVersion: varchar('protocol_version', { length: 64 }).notNull(),
    receiptCommitment: varchar('receipt_commitment', { length: 64 }).notNull(),
    receiptVersion: varchar('receipt_version', { length: 64 }).notNull(),
    submissionFingerprint: varchar('submission_fingerprint', { length: 64 }).notNull(),
    voteEncoding: integer('vote_encoding').notNull(),
  },
  (table) => [
    check('accepted_votes_configuration_version_check', sql`${table.configurationVersion} > 0`),
    check('accepted_votes_vote_encoding_check', sql`${table.voteEncoding} >= 0`),
    check(
      'accepted_votes_nullifier_canonical_check',
      sql`${table.nullifier} ~ '^(0|[1-9][0-9]{0,76})$'`,
    ),
    check(
      'accepted_votes_submission_fingerprint_check',
      sql`${table.submissionFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'accepted_votes_receipt_commitment_check',
      sql`${table.receiptCommitment} ~ '^[0-9a-f]{64}$'`,
    ),
    uniqueIndex('accepted_votes_election_protocol_nullifier_unique').on(
      table.electionId,
      table.protocolVersion,
      table.nullifier,
    ),
    index('accepted_votes_election_configuration_idx').on(
      table.electionId,
      table.configurationVersion,
    ),
  ],
);

export const voteProofEvidence = votingSchema.table(
  'vote_proof_evidence',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).notNull(),
    proof: jsonb('proof').notNull(),
    proofDigest: varchar('proof_digest', { length: 64 }).notNull(),
    publicSignals: jsonb('public_signals').notNull(),
    publicSignalsDigest: varchar('public_signals_digest', { length: 64 }).notNull(),
    schemaVersion: varchar('schema_version', { length: 64 }).notNull(),
    voteId: uuid('vote_id')
      .primaryKey()
      .references(() => acceptedVotes.id, { onDelete: 'restrict' }),
  },
  (table) => [
    check('vote_proof_evidence_proof_digest_check', sql`${table.proofDigest} ~ '^[0-9a-f]{64}$'`),
    check(
      'vote_proof_evidence_public_signals_digest_check',
      sql`${table.publicSignalsDigest} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
