import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { canonicalDigestV1, type CanonicalValue } from '@votaciones/verification-protocol';

import { appendAuditEventPg } from '../../../audit/infrastructure/persistence/audit-functions.js';
import type { AcceptedVoteRecord, VoteAcceptanceContext } from '../../domain/accepted-vote.js';
import {
  createVoteReceiptV1,
  PROOF_EVIDENCE_SCHEMA_V1,
  type VoteReceiptV1,
} from '../../domain/vote-receipt.js';
import { VotingError } from '../../domain/voting-errors.js';
import type {
  AcceptVerifiedVote,
  VoteAcceptanceResult,
  VoteRepository,
} from '../../application/ports/vote-repository.port.js';

interface ContextRow extends pg.QueryResultRow {
  circuit_version: string | null;
  closes_at: Date;
  configuration_version: number;
  election_id: string;
  merkle_root: string | null;
  observed_at: Date;
  opens_at: Date;
  option_count: number;
  protocol_version: string | null;
  snapshot: unknown;
  status: string;
}

interface VoteRow extends pg.QueryResultRow {
  accepted_at: Date;
  circuit_version: string;
  configuration_version: number;
  election_id: string;
  id: string;
  nullifier: string;
  protocol_version: string;
  receipt_commitment: string;
  receipt_version: string;
  submission_fingerprint: string;
  vote_encoding: number;
}

interface Queryable {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
}

const CONTEXT_SQL = `
  SELECT e.id AS election_id,
         e.status,
         e.opens_at,
         e.closes_at,
         e.configuration_version,
         e.protocol_version,
         e.circuit_version,
         cv.snapshot,
         snapshot.merkle_root,
         (SELECT count(*)::int FROM election.election_options o WHERE o.election_id = e.id) AS option_count,
         clock_timestamp() AS observed_at
    FROM election.elections e
    LEFT JOIN election.election_configuration_versions cv
      ON cv.election_id = e.id AND cv.version = e.configuration_version
    LEFT JOIN eligibility.eligibility_snapshots snapshot
      ON snapshot.election_id = e.id
     AND snapshot.configuration_version = e.configuration_version
     AND snapshot.status = 'FROZEN'
   WHERE e.id = $1`;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function contextFromRow(row: ContextRow): VoteAcceptanceContext {
  const snapshot = record(row.snapshot);
  const cryptographic = record(snapshot?.['cryptographicConfiguration']);
  const electionContext = cryptographic?.['electionContext'];
  const frozenProtocol = cryptographic?.['protocolVersion'];
  const frozenCircuit = cryptographic?.['circuitVersion'];
  const optionMapping = cryptographic?.['optionMapping'];
  if (
    typeof electionContext !== 'string' ||
    typeof frozenProtocol !== 'string' ||
    typeof frozenCircuit !== 'string' ||
    !Array.isArray(optionMapping) ||
    optionMapping.length !== row.option_count ||
    row.merkle_root === null ||
    row.protocol_version !== frozenProtocol ||
    row.circuit_version !== frozenCircuit
  ) {
    throw new VotingError(
      'VOTE_ACCEPTANCE_UNAVAILABLE',
      'Frozen election voting configuration is unavailable.',
    );
  }
  return {
    circuitVersion: frozenCircuit,
    closesAt: row.closes_at,
    configurationVersion: row.configuration_version,
    electionContext,
    electionId: row.election_id,
    merkleRoot: row.merkle_root,
    observedAt: row.observed_at,
    opensAt: row.opens_at,
    optionCount: row.option_count,
    protocolVersion: frozenProtocol,
    status: row.status,
  };
}

function sameContext(left: VoteAcceptanceContext, right: VoteAcceptanceContext): boolean {
  return (
    left.electionId === right.electionId &&
    left.configurationVersion === right.configurationVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.circuitVersion === right.circuitVersion &&
    left.merkleRoot === right.merkleRoot &&
    left.electionContext === right.electionContext &&
    left.optionCount === right.optionCount
  );
}

function assertOpen(context: VoteAcceptanceContext): void {
  if (context.status !== 'OPEN') {
    throw new VotingError('ELECTION_NOT_OPEN', 'Election is not open.');
  }
  if (context.observedAt < context.opensAt) {
    throw new VotingError('ELECTION_NOT_STARTED', 'Election has not started.');
  }
  if (context.observedAt >= context.closesAt) {
    throw new VotingError('ELECTION_CLOSED', 'Election voting window is closed.');
  }
}

function receiptFromRow(row: VoteRow): VoteReceiptV1 {
  return {
    acceptedAt: new Date(row.accepted_at),
    electionId: row.election_id,
    nullifier: row.nullifier,
    receiptCommitment: row.receipt_commitment,
    receiptVersion: row.receipt_version as VoteReceiptV1['receiptVersion'],
  };
}

function acceptedVoteFromRow(row: VoteRow): AcceptedVoteRecord {
  return {
    circuitVersion: row.circuit_version,
    configurationVersion: row.configuration_version,
    electionId: row.election_id,
    id: row.id,
    nullifier: row.nullifier,
    protocolVersion: row.protocol_version,
    receipt: receiptFromRow(row),
    submissionFingerprint: row.submission_fingerprint,
    voteEncoding: row.vote_encoding,
  };
}

async function contextQuery(executor: Queryable, electionId: string, lock: boolean) {
  const result = await executor.query<ContextRow>(
    `${CONTEXT_SQL}${lock ? ' FOR UPDATE OF e' : ''}`,
    [electionId],
  );
  return result.rows[0] ? contextFromRow(result.rows[0]) : null;
}

async function voteQuery(
  executor: Queryable,
  electionId: string,
  protocolVersion: string,
  nullifier: string,
): Promise<VoteRow | null> {
  const result = await executor.query<VoteRow>(
    `SELECT * FROM voting.accepted_votes
      WHERE election_id = $1 AND protocol_version = $2 AND nullifier = $3`,
    [electionId, protocolVersion, nullifier],
  );
  return result.rows[0] ?? null;
}

export class PostgresVoteRepository implements VoteRepository {
  constructor(private readonly pool: pg.Pool) {}

  async loadAcceptanceContext(electionId: string): Promise<VoteAcceptanceContext | null> {
    try {
      return await contextQuery(this.pool, electionId, false);
    } catch (error: unknown) {
      if (error instanceof VotingError) throw error;
      throw new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.', {
        cause: error,
      });
    }
  }

  async accept(command: AcceptVerifiedVote): Promise<VoteAcceptanceResult> {
    const proofDigest = canonicalDigestV1('votaciones/proof/v1', command.proof as CanonicalValue);
    const publicSignalsDigest = canonicalDigestV1(
      'votaciones/public-signals/v1',
      command.publicSignals,
    );
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error: unknown) {
      throw new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.', {
        cause: error,
      });
    }
    try {
      await client.query('BEGIN');
      const locked = await contextQuery(client, command.context.electionId, true);
      if (!locked) {
        throw new VotingError('ELECTION_NOT_FOUND', 'Election not found.');
      }
      assertOpen(locked);
      if (!sameContext(locked, command.context)) {
        throw new VotingError(
          'VOTE_SUBMISSION_CONFLICT',
          'Election configuration changed before vote acceptance.',
        );
      }
      if (command.voteEncoding < 0 || command.voteEncoding >= locked.optionCount) {
        throw new VotingError('INVALID_VOTE_ENCODING', 'Vote encoding is invalid.');
      }

      const receipt = createVoteReceiptV1({
        acceptedAt: locked.observedAt,
        configurationVersion: locked.configurationVersion,
        electionId: locked.electionId,
        nullifier: command.nullifier,
        protocolVersion: locked.protocolVersion,
        voteEncoding: command.voteEncoding,
      });
      const voteId = randomUUID();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO voting.accepted_votes
          (accepted_at, circuit_version, configuration_version, election_id, id, nullifier,
           protocol_version, receipt_commitment, receipt_version, submission_fingerprint, vote_encoding)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (election_id, protocol_version, nullifier) DO NOTHING
         RETURNING id`,
        [
          receipt.acceptedAt,
          locked.circuitVersion,
          locked.configurationVersion,
          locked.electionId,
          voteId,
          command.nullifier,
          locked.protocolVersion,
          receipt.receiptCommitment,
          receipt.receiptVersion,
          command.submissionFingerprint,
          command.voteEncoding,
        ],
      );
      if (inserted.rowCount === 1) {
        await client.query(
          `INSERT INTO voting.vote_proof_evidence
            (created_at, proof, proof_digest, public_signals, public_signals_digest, schema_version, vote_id)
           VALUES ($1,$2::jsonb,$3,$4::jsonb,$5,$6,$7)`,
          [
            receipt.acceptedAt,
            JSON.stringify(command.proof),
            proofDigest,
            JSON.stringify(command.publicSignals),
            publicSignalsDigest,
            PROOF_EVIDENCE_SCHEMA_V1,
            voteId,
          ],
        );
        await appendAuditEventPg(client, {
          actorType: 'ANONYMOUS',
          aggregateId: locked.electionId,
          aggregateType: 'election',
          eventType: 'vote_accepted',
          eventVersion: 1,
          payload: {
            configurationVersion: locked.configurationVersion,
            electionId: locked.electionId,
            protocolVersion: locked.protocolVersion,
            receiptCommitment: receipt.receiptCommitment,
          },
          streamId: `election:${locked.electionId}`,
        });
        await client.query('COMMIT');
        return { idempotentRetry: false, receipt };
      }

      const existing = await voteQuery(
        client,
        locked.electionId,
        locked.protocolVersion,
        command.nullifier,
      );
      if (!existing) {
        throw new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.');
      }
      if (existing.submission_fingerprint !== command.submissionFingerprint) {
        throw new VotingError('NULLIFIER_ALREADY_USED', 'Nullifier has already been used.');
      }
      await client.query('COMMIT');
      return { idempotentRetry: true, receipt: receiptFromRow(existing) };
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof VotingError) throw error;
      throw new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.', {
        cause: error,
      });
    } finally {
      client.release();
    }
  }

  async findByNullifier(
    electionId: string,
    protocolVersion: string,
    nullifier: string,
  ): Promise<AcceptedVoteRecord | null> {
    try {
      const row = await voteQuery(this.pool, electionId, protocolVersion, nullifier);
      return row ? acceptedVoteFromRow(row) : null;
    } catch (error: unknown) {
      throw new VotingError('VOTE_ACCEPTANCE_UNAVAILABLE', 'Vote acceptance is unavailable.', {
        cause: error,
      });
    }
  }
}
