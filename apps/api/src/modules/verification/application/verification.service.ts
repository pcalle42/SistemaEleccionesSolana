import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { protocolArtifactLocationsV1 } from '@votaciones/zk-protocol';
import {
  acceptedVoteSetSnapshotV1,
  canonicalJsonFileV1,
  canonicalJsonLinesV1,
  canonicalVoteJsonlV1,
  computeTallyV1,
  PACKAGE_VERSION_V1,
  PUBLIC_VOTE_VERSION_V1,
  sha256Hex,
  verificationPackageContentDigestV1,
  verifyElectionPackage,
  type CanonicalValue,
  type ElectionManifestV1,
  type PublicAcceptedVoteV1,
  type PublicReceiptV1,
  type VerificationPackageManifestV1,
  type VerificationReportV1,
} from '@votaciones/verification-protocol';
import type pg from 'pg';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AppConfig } from '../../../config/app-config.js';
import { APP_CONFIG } from '../../../config/config.tokens.js';
import { DATABASE_POOL } from '../../../database/database.tokens.js';
import type { AdminPrincipal } from '../../auth/domain/admin-principal.js';
import {
  appendAuditEventPg,
  createCheckpointPg,
} from '../../audit/infrastructure/persistence/audit-functions.js';
import { FilesystemVerificationArtifactStore } from '../infrastructure/filesystem-verification-artifact.store.js';
import { trustedProtocolManifestV1 } from '../domain/election-manifest.js';

interface ElectionResultRow extends pg.QueryResultRow {
  circuit_version: string;
  configuration_version: number;
  election_id: string;
  protocol_version: string;
  status: string;
  voting_method: 'SINGLE_CHOICE';
}

interface ManifestRow extends pg.QueryResultRow {
  manifest: ElectionManifestV1;
  manifest_digest: string;
}

interface VoteEvidenceRow extends pg.QueryResultRow {
  circuit_version: string;
  configuration_version: number;
  election_id: string;
  nullifier: string;
  proof: PublicAcceptedVoteV1['proof'];
  proof_digest: string;
  protocol_version: string;
  public_signals: string[];
  public_signals_digest: string;
  receipt_commitment: string;
  receipt_version: string;
  vote_encoding: number;
}

interface CheckpointPublicRow extends pg.QueryResultRow {
  checkpointVersion: string;
  createdAt: Date;
  fromSequence: number;
  headHash: string;
  id: string;
  streamId: string;
  toSequence: number;
}

export interface VerificationMetadataRow extends pg.QueryResultRow {
  contentDigest: string;
  createdAt: Date;
  packageVersion: string;
  report: VerificationReportV1;
}

export interface ReceiptPublicRow extends pg.QueryResultRow {
  nullifier: string;
  receiptCommitment: string;
  receiptVersion: string;
}

const VOTES_SQL = `
  SELECT vote.election_id, vote.configuration_version, vote.protocol_version,
         vote.circuit_version, vote.nullifier, vote.vote_encoding,
         vote.receipt_commitment, vote.receipt_version,
         evidence.proof, evidence.proof_digest,
         evidence.public_signals, evidence.public_signals_digest
    FROM voting.accepted_votes vote
    JOIN voting.vote_proof_evidence evidence ON evidence.vote_id = vote.id
   WHERE vote.election_id = $1 AND vote.configuration_version = $2
   ORDER BY vote.nullifier::numeric`;

const PUBLIC_PACKAGE_FILES = new Set([
  'README.md',
  'accepted-vote-set.json',
  'accepted-votes.jsonl',
  'artifact-digests.json',
  'checkpoints.json',
  'election-manifest.json',
  'eligibility.json',
  'package-manifest.json',
  'protocol-manifest.json',
  'receipts.jsonl',
  'tally.json',
  'verification_key.json',
]);

function publicVotes(manifest: ElectionManifestV1, rows: readonly VoteEvidenceRow[]) {
  return rows.map((row): PublicAcceptedVoteV1 => ({
    circuitVersion: row.circuit_version,
    configurationVersion: row.configuration_version,
    electionContext: manifest.electionContext,
    electionId: row.election_id,
    merkleRoot: manifest.merkleRoot,
    nullifier: row.nullifier,
    proof: row.proof,
    proofDigest: row.proof_digest,
    protocolVersion: row.protocol_version,
    publicSignals: row.public_signals,
    publicSignalsDigest: row.public_signals_digest,
    receiptCommitment: row.receipt_commitment,
    recordVersion: PUBLIC_VOTE_VERSION_V1,
    voteEncoding: row.vote_encoding,
  }));
}

function fail(code: string, message: string, category: 'not-found' | 'domain-rule' | 'conflict') {
  return new ApplicationError(code, message, category);
}

@Injectable()
export class VerificationService {
  private readonly store: FilesystemVerificationArtifactStore;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: pg.Pool,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.store = new FilesystemVerificationArtifactStore(config.verification.artifactDirectory);
  }

  async getManifest(electionId: string) {
    const result = await this.pool.query<ManifestRow>(
      `SELECT manifest, manifest_digest FROM result.election_manifests
        WHERE election_id = $1 AND publication_state = 'PUBLISHED'`,
      [electionId],
    );
    const row = result.rows[0];
    if (!row)
      throw fail('ELECTION_MANIFEST_NOT_FOUND', 'Election manifest not found.', 'not-found');
    return { manifest: row.manifest, manifestDigest: row.manifest_digest };
  }

  async startCounting(electionId: string, principal: AdminPrincipal): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const electionResult = await client.query<ElectionResultRow>(
        `SELECT id AS election_id, status, configuration_version, protocol_version,
                circuit_version, voting_method
           FROM election.elections WHERE id = $1 FOR UPDATE`,
        [electionId],
      );
      const election = electionResult.rows[0];
      if (!election) throw fail('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
      if (election.status !== 'CLOSED') {
        throw fail('INVALID_ELECTION_TRANSITION', 'Election must be closed.', 'domain-rule');
      }
      const manifestResult = await client.query<ManifestRow>(
        `SELECT manifest, manifest_digest FROM result.election_manifests
          WHERE election_id = $1 AND configuration_version = $2 AND publication_state = 'PUBLISHED'`,
        [electionId, election.configuration_version],
      );
      const manifest = manifestResult.rows[0]?.manifest;
      if (!manifest)
        throw fail('ELECTION_MANIFEST_NOT_FOUND', 'Election manifest not found.', 'conflict');
      const rows = await client.query<VoteEvidenceRow>(VOTES_SQL, [
        electionId,
        election.configuration_version,
      ]);
      const votes = publicVotes(manifest, rows.rows);
      const jsonl = canonicalVoteJsonlV1(votes);
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const frozenAt = time.rows[0]!.now;
      const snapshot = acceptedVoteSetSnapshotV1(
        manifest,
        jsonl,
        votes.length,
        frozenAt.toISOString(),
      );
      const tally = computeTallyV1(manifest, snapshot, votes);
      await client.query(
        `INSERT INTO result.accepted_vote_set_snapshots
          (canonical_digest, configuration_version, created_at, election_id, record_count, snapshot_version)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          snapshot.canonicalDigest,
          snapshot.configurationVersion,
          frozenAt,
          electionId,
          snapshot.recordCount,
          snapshot.snapshotVersion,
        ],
      );
      await client.query(
        `INSERT INTO result.tally_manifests
          (accepted_vote_set_digest, configuration_version, created_at, election_id, tally, tally_version)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          snapshot.canonicalDigest,
          tally.configurationVersion,
          frozenAt,
          electionId,
          JSON.stringify(tally),
          tally.tallyVersion,
        ],
      );
      await client.query(
        `UPDATE election.elections SET status = 'COUNTING', row_version = row_version + 1,
                updated_at = $2 WHERE id = $1`,
        [electionId, frozenAt],
      );
      await client.query(
        `INSERT INTO election.election_state_event
          (actor_admin_id, configuration_version, election_id, new_state, occurred_at, previous_state)
         VALUES ($1,$2,$3,'COUNTING',$4,'CLOSED')`,
        [principal.adminId, election.configuration_version, electionId, frozenAt],
      );
      await appendAuditEventPg(client, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'vote_set_frozen',
        eventVersion: 1,
        payload: {
          canonicalDigest: snapshot.canonicalDigest,
          configurationVersion: election.configuration_version,
          electionId,
          recordCount: snapshot.recordCount,
        },
        streamId: `election:${electionId}`,
      });
      await appendAuditEventPg(client, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'tally_computed',
        eventVersion: 1,
        payload: {
          acceptedVoteSetDigest: snapshot.canonicalDigest,
          acceptedVoteCount: tally.acceptedVoteCount,
          configurationVersion: election.configuration_version,
          electionId,
        },
        streamId: `election:${electionId}`,
      });
      await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
      return tally;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async generatePackage(electionId: string, principal: AdminPrincipal) {
    const existingPackage = await this.pool.query<{
      content_digest: string;
      package_path: string;
      package_version: string;
      verification_report: VerificationReportV1;
    }>(
      `SELECT content_digest, package_path, package_version, verification_report
         FROM result.verification_packages WHERE election_id = $1`,
      [electionId],
    );
    if (existingPackage.rows[0]) {
      const existing = existingPackage.rows[0];
      const report = await verifyElectionPackage(existing.package_path);
      if (!report.valid || report.packageContentDigest !== existing.content_digest) {
        throw fail('VERIFICATION_PACKAGE_INVALID', 'Stored package did not verify.', 'conflict');
      }
      return {
        contentDigest: existing.content_digest,
        packageVersion: existing.package_version,
        report,
      };
    }
    const electionResult = await this.pool.query<ElectionResultRow>(
      `SELECT id AS election_id, status, configuration_version, protocol_version,
              circuit_version, voting_method FROM election.elections WHERE id = $1`,
      [electionId],
    );
    const election = electionResult.rows[0];
    if (!election) throw fail('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
    if (election.status !== 'COUNTING') {
      throw fail('INVALID_ELECTION_TRANSITION', 'Election must be counting.', 'domain-rule');
    }
    const manifestEnvelope = await this.getManifest(electionId);
    const votesResult = await this.pool.query<VoteEvidenceRow>(VOTES_SQL, [
      electionId,
      election.configuration_version,
    ]);
    const votes = publicVotes(manifestEnvelope.manifest, votesResult.rows);
    const acceptedVotes = canonicalVoteJsonlV1(votes);
    const snapshotResult = await this.pool.query<{ snapshot: unknown }>(
      `SELECT jsonb_build_object(
          'canonicalDigest', canonical_digest, 'configurationVersion', configuration_version,
          'electionId', election_id,
          'frozenAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'protocolVersion', $3::text,
          'recordCount', record_count, 'snapshotVersion', snapshot_version
        ) AS snapshot FROM result.accepted_vote_set_snapshots
        WHERE election_id = $1 AND configuration_version = $2`,
      [electionId, election.configuration_version, election.protocol_version],
    );
    const tallyResult = await this.pool.query<{ tally: unknown }>(
      `SELECT tally FROM result.tally_manifests WHERE election_id = $1 AND configuration_version = $2`,
      [electionId, election.configuration_version],
    );
    if (!snapshotResult.rows[0] || !tallyResult.rows[0]) {
      throw fail('RESULT_EVIDENCE_MISSING', 'Frozen vote set or tally is missing.', 'conflict');
    }
    const eligibilityResult = await this.pool.query<{ eligibility: unknown }>(
      `SELECT jsonb_build_object(
          'commitmentSchemeVersion', commitment_scheme_version,
          'configurationVersion', configuration_version, 'electionId', election_id,
          'leafCount', leaf_count, 'merkleRoot', merkle_root,
          'snapshotVersion', version, 'treeDepth', tree_depth
        ) AS eligibility FROM eligibility.eligibility_snapshots
        WHERE election_id = $1 AND configuration_version = $2 AND status = 'FROZEN'`,
      [electionId, election.configuration_version],
    );
    const checkpointsResult = await this.pool.query<CheckpointPublicRow>(
      `SELECT checkpoint_version AS "checkpointVersion", created_at AS "createdAt",
              from_sequence::int AS "fromSequence", head_hash AS "headHash", id,
              stream_id AS "streamId", to_sequence::int AS "toSequence"
         FROM audit.audit_checkpoint WHERE stream_id = $1 ORDER BY to_sequence`,
      [`election:${electionId}`],
    );
    if (!eligibilityResult.rows[0] || checkpointsResult.rows.length === 0) {
      throw fail(
        'VERIFICATION_EVIDENCE_MISSING',
        'Verification evidence is incomplete.',
        'conflict',
      );
    }
    const locations = protocolArtifactLocationsV1();
    const [protocolManifestBytes, verificationKeyBytes] = await Promise.all([
      readFile(locations.manifest),
      readFile(locations.verificationKey),
    ]);
    const protocol = trustedProtocolManifestV1();
    const receipts: PublicReceiptV1[] = votes.map((vote, index) => ({
      nullifier: vote.nullifier,
      receiptCommitment: vote.receiptCommitment,
      receiptVersion: votesResult.rows[index]!.receipt_version,
    }));
    const checkpoints = checkpointsResult.rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    const files: Record<string, string | Uint8Array> = {
      'README.md':
        '# Paquete de verificación electoral\n\nVerifique con `pnpm verify:election -- --package <directorio>`. No contiene PII ni marcas de tiempo individuales de voto.\n',
      'accepted-vote-set.json': canonicalJsonFileV1(
        snapshotResult.rows[0].snapshot as CanonicalValue,
      ),
      'accepted-votes.jsonl': acceptedVotes,
      'artifact-digests.json': canonicalJsonFileV1(
        protocol.artifactDigests as unknown as CanonicalValue,
      ),
      'checkpoints.json': canonicalJsonFileV1(checkpoints),
      'election-manifest.json': canonicalJsonFileV1(manifestEnvelope as unknown as CanonicalValue),
      'eligibility.json': canonicalJsonFileV1(
        eligibilityResult.rows[0].eligibility as CanonicalValue,
      ),
      'protocol-manifest.json': protocolManifestBytes,
      'receipts.jsonl': canonicalJsonLinesV1(receipts as unknown as CanonicalValue[]),
      'tally.json': canonicalJsonFileV1(tallyResult.rows[0].tally as CanonicalValue),
      'verification_key.json': verificationKeyBytes,
    };
    const digests = Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, sha256Hex(bytes)]),
    );
    const contentDigest = verificationPackageContentDigestV1(digests);
    const packageManifest: VerificationPackageManifestV1 = {
      contentDigest,
      electionId,
      files: digests,
      packageVersion: PACKAGE_VERSION_V1,
    };
    files['package-manifest.json'] = canonicalJsonFileV1(
      packageManifest as unknown as CanonicalValue,
    );
    const packagePath = await this.store.putImmutable(electionId, contentDigest, files);
    const report = await verifyElectionPackage(packagePath);
    if (!report.valid) {
      throw fail('VERIFICATION_PACKAGE_INVALID', 'Generated package did not verify.', 'conflict');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query<ElectionResultRow>(
        `SELECT id AS election_id, status, configuration_version, protocol_version,
                circuit_version, voting_method FROM election.elections WHERE id = $1 FOR UPDATE`,
        [electionId],
      );
      if (
        locked.rows[0]?.status !== 'COUNTING' ||
        locked.rows[0].configuration_version !== election.configuration_version
      ) {
        throw fail('ELECTION_CHANGED', 'Election changed while packaging.', 'conflict');
      }
      await client.query(
        `INSERT INTO result.verification_packages
          (configuration_version, content_digest, created_at, election_id, package_path, package_version, verification_report)
         VALUES ($1,$2,clock_timestamp(),$3,$4,$5,$6::jsonb)
         ON CONFLICT (election_id, configuration_version) DO NOTHING`,
        [
          election.configuration_version,
          contentDigest,
          electionId,
          packagePath,
          PACKAGE_VERSION_V1,
          JSON.stringify(report),
        ],
      );
      await appendAuditEventPg(client, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'verification_package_generated',
        eventVersion: 1,
        payload: {
          configurationVersion: election.configuration_version,
          contentDigest,
          electionId,
        },
        streamId: `election:${electionId}`,
      });
      await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { contentDigest, packageVersion: PACKAGE_VERSION_V1, report };
  }

  async publishResults(electionId: string, principal: AdminPrincipal) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<
        ElectionResultRow & {
          content_digest: string;
          package_path: string;
          verification_report: VerificationReportV1;
          tally: unknown;
        }
      >(
        `SELECT e.id AS election_id, e.status, e.configuration_version, e.protocol_version,
                e.circuit_version, e.voting_method, package.content_digest,
                package.package_path, package.verification_report, tally.tally
           FROM election.elections e
           JOIN result.verification_packages package ON package.election_id = e.id AND package.configuration_version = e.configuration_version
           JOIN result.tally_manifests tally ON tally.election_id = e.id AND tally.configuration_version = e.configuration_version
          WHERE e.id = $1 FOR UPDATE OF e`,
        [electionId],
      );
      const row = result.rows[0];
      if (!row)
        throw fail('RESULT_EVIDENCE_MISSING', 'Verified result evidence is missing.', 'conflict');
      const freshReport = await verifyElectionPackage(row.package_path);
      if (!freshReport.valid || freshReport.packageContentDigest !== row.content_digest) {
        throw fail(
          'RESULT_PUBLICATION_REJECTED',
          'Verification package no longer validates.',
          'domain-rule',
        );
      }
      if (row.status === 'RESULTS_PUBLISHED' && row.verification_report.valid === true) {
        await client.query('COMMIT');
        return row.tally;
      }
      if (row.status !== 'COUNTING' || row.verification_report.valid !== true) {
        throw fail(
          'RESULT_PUBLICATION_REJECTED',
          'Verified results cannot be published.',
          'domain-rule',
        );
      }
      const now = new Date();
      await client.query(
        `UPDATE election.elections SET status = 'RESULTS_PUBLISHED', row_version = row_version + 1,
                updated_at = $2 WHERE id = $1`,
        [electionId, now],
      );
      await client.query(
        `INSERT INTO election.election_state_event
          (actor_admin_id, configuration_version, election_id, new_state, occurred_at, previous_state)
         VALUES ($1,$2,$3,'RESULTS_PUBLISHED',$4,'COUNTING')`,
        [principal.adminId, row.configuration_version, electionId, now],
      );
      await appendAuditEventPg(client, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'results_published',
        eventVersion: 1,
        payload: {
          configurationVersion: row.configuration_version,
          contentDigest: row.content_digest,
          electionId,
        },
        streamId: `election:${electionId}`,
      });
      await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
      return row.tally;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getVerification(electionId: string) {
    const result = await this.pool.query<VerificationMetadataRow>(
      `SELECT content_digest AS "contentDigest", created_at AS "createdAt",
              package_version AS "packageVersion", verification_report AS report
         FROM result.verification_packages WHERE election_id = $1`,
      [electionId],
    );
    if (!result.rows[0])
      throw fail('VERIFICATION_PACKAGE_NOT_FOUND', 'Verification package not found.', 'not-found');
    return result.rows[0];
  }

  async getVerificationFile(electionId: string, fileName: string) {
    if (!PUBLIC_PACKAGE_FILES.has(fileName)) {
      throw fail(
        'VERIFICATION_ARTIFACT_NOT_FOUND',
        'Verification artifact not found.',
        'not-found',
      );
    }
    const result = await this.pool.query<{ package_path: string }>(
      'SELECT package_path FROM result.verification_packages WHERE election_id = $1',
      [electionId],
    );
    const row = result.rows[0];
    if (!row) {
      throw fail('VERIFICATION_PACKAGE_NOT_FOUND', 'Verification package not found.', 'not-found');
    }
    const bytes = await readFile(join(row.package_path, fileName));
    return { bytes, digest: sha256Hex(bytes), fileName };
  }

  async createCheckpoint(electionId: string, principal: AdminPrincipal) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const election = await client.query<{ configuration_version: number }>(
        'SELECT configuration_version FROM election.elections WHERE id = $1 FOR SHARE',
        [electionId],
      );
      if (!election.rows[0]) throw fail('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
      await appendAuditEventPg(client, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'audit_checkpoint_created',
        eventVersion: 1,
        payload: {
          configurationVersion: election.rows[0].configuration_version,
          electionId,
        },
        streamId: `election:${electionId}`,
      });
      const checkpoint = await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
      return checkpoint;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async getResults(electionId: string) {
    const result = await this.pool.query<{ tally: unknown }>(
      `SELECT tally.tally FROM result.tally_manifests tally
         JOIN election.elections election ON election.id = tally.election_id
        WHERE tally.election_id = $1 AND election.status = 'RESULTS_PUBLISHED'`,
      [electionId],
    );
    if (!result.rows[0])
      throw fail('RESULTS_NOT_PUBLISHED', 'Results are not published.', 'not-found');
    return result.rows[0].tally;
  }

  async getReceipt(electionId: string, receiptCommitment: string) {
    const result = await this.pool.query<ReceiptPublicRow>(
      `SELECT vote.nullifier, vote.receipt_commitment AS "receiptCommitment",
              vote.receipt_version AS "receiptVersion"
         FROM voting.accepted_votes vote
         JOIN result.verification_packages package ON package.election_id = vote.election_id
          AND package.configuration_version = vote.configuration_version
        WHERE vote.election_id = $1 AND vote.receipt_commitment = $2`,
      [electionId, receiptCommitment],
    );
    if (!result.rows[0]) throw fail('RECEIPT_NOT_FOUND', 'Receipt not found.', 'not-found');
    return result.rows[0];
  }
}
