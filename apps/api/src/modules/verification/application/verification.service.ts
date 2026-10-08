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
  electionResultV1,
  PACKAGE_VERSION_V1,
  PUBLIC_VOTE_VERSION_V1,
  sha256Hex,
  verificationPackageContentDigestV1,
  verifyElectionPackage,
  type CanonicalValue,
  type AcceptedVoteSetSnapshotV1,
  type ElectionManifestV1,
  type ElectionResultV1,
  type PublicAcceptedVoteV1,
  type PublicReceiptV1,
  type TallyManifestV1,
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
  resultVersion: number;
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
     AND vote.protocol_version = $3 AND vote.circuit_version = $4
   ORDER BY vote.nullifier::numeric`;

const PUBLIC_PACKAGE_FILES = new Set([
  'README.md',
  'accepted-vote-set.json',
  'accepted-votes.jsonl',
  'artifact-digests.json',
  'checkpoints.json',
  'election-manifest.json',
  'eligibility.json',
  'verification-package-manifest.json',
  'protocol-manifest.json',
  'receipts.jsonl',
  'result.json',
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

function packageEntries(files: Readonly<Record<string, string | Uint8Array>>) {
  return Object.entries(files)
    .map(([logicalPath, bytes]) => ({
      logicalPath,
      sha256: sha256Hex(bytes),
      size: typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.byteLength,
    }))
    .sort((left, right) =>
      left.logicalPath < right.logicalPath ? -1 : left.logicalPath > right.logicalPath ? 1 : 0,
    );
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

  async enterCounting(
    electionId: string,
    principal: AdminPrincipal,
  ): Promise<AcceptedVoteSetSnapshotV1> {
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
      if (election.status === 'COUNTING' || election.status === 'RESULTS_PUBLISHED') {
        const existing = await client.query<{
          canonical_digest: string;
          created_at: Date;
          protocol_version: string;
          record_count: number;
          snapshot_version: AcceptedVoteSetSnapshotV1['snapshotVersion'];
        }>(
          `SELECT canonical_digest, created_at, protocol_version, record_count, snapshot_version
             FROM result.accepted_vote_set_snapshots
            WHERE election_id = $1 AND configuration_version = $2`,
          [electionId, election.configuration_version],
        );
        const snapshot = existing.rows[0];
        if (!snapshot)
          throw fail('FINAL_VOTE_SET_CONFLICT', 'Final vote set is missing.', 'conflict');
        await client.query('COMMIT');
        return {
          canonicalDigest: snapshot.canonical_digest,
          configurationVersion: election.configuration_version,
          electionId,
          frozenAt: snapshot.created_at.toISOString(),
          protocolVersion: snapshot.protocol_version,
          recordCount: snapshot.record_count,
          snapshotVersion: snapshot.snapshot_version,
        };
      }
      if (election.status !== 'CLOSED') {
        throw fail('ELECTION_NOT_CLOSED', 'Election must be closed.', 'domain-rule');
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
        election.protocol_version,
        election.circuit_version,
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
      await client.query(
        `INSERT INTO result.accepted_vote_set_snapshots
          (canonical_digest, configuration_version, created_at, election_id, protocol_version,
           record_count, snapshot_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          snapshot.canonicalDigest,
          snapshot.configurationVersion,
          frozenAt,
          electionId,
          election.protocol_version,
          snapshot.recordCount,
          snapshot.snapshotVersion,
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
        eventType: 'accepted_vote_set_frozen',
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
        eventType: 'counting_started',
        eventVersion: 1,
        payload: {
          acceptedVoteSetDigest: snapshot.canonicalDigest,
          configurationVersion: election.configuration_version,
          electionId,
        },
        streamId: `election:${electionId}`,
      });
      await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
      return snapshot;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async computeTally(electionId: string, principal: AdminPrincipal) {
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
      if (election.status !== 'COUNTING' && election.status !== 'RESULTS_PUBLISHED') {
        throw fail('ELECTION_NOT_COUNTING', 'Election must be counting.', 'domain-rule');
      }
      const manifestResult = await client.query<ManifestRow>(
        `SELECT manifest, manifest_digest FROM result.election_manifests
          WHERE election_id = $1 AND configuration_version = $2 AND publication_state = 'PUBLISHED'`,
        [electionId, election.configuration_version],
      );
      const manifest = manifestResult.rows[0]?.manifest;
      if (!manifest)
        throw fail('ELECTION_MANIFEST_NOT_FOUND', 'Election manifest not found.', 'conflict');
      const snapshotResult = await client.query<{
        canonical_digest: string;
        created_at: Date;
        protocol_version: string;
        record_count: number;
        snapshot_version: AcceptedVoteSetSnapshotV1['snapshotVersion'];
      }>(
        `SELECT canonical_digest, created_at, protocol_version, record_count, snapshot_version
           FROM result.accepted_vote_set_snapshots
          WHERE election_id = $1 AND configuration_version = $2`,
        [electionId, election.configuration_version],
      );
      const frozen = snapshotResult.rows[0];
      if (!frozen) throw fail('FINAL_VOTE_SET_CONFLICT', 'Final vote set is missing.', 'conflict');
      const snapshot: AcceptedVoteSetSnapshotV1 = {
        canonicalDigest: frozen.canonical_digest,
        configurationVersion: election.configuration_version,
        electionId,
        frozenAt: frozen.created_at.toISOString(),
        protocolVersion: frozen.protocol_version,
        recordCount: frozen.record_count,
        snapshotVersion: frozen.snapshot_version,
      };
      const rows = await client.query<VoteEvidenceRow>(VOTES_SQL, [
        electionId,
        election.configuration_version,
        election.protocol_version,
        election.circuit_version,
      ]);
      const votes = publicVotes(manifest, rows.rows);
      const jsonl = canonicalVoteJsonlV1(votes);
      if (
        acceptedVoteSetSnapshotV1(manifest, jsonl, votes.length, snapshot.frozenAt)
          .canonicalDigest !== snapshot.canonicalDigest ||
        votes.length !== snapshot.recordCount
      ) {
        throw fail('VOTE_SET_DIGEST_MISMATCH', 'Final vote set digest does not match.', 'conflict');
      }
      const tally = computeTallyV1(manifest, snapshot, votes);
      const sqlTotals = await client.query<{ count: number; vote_encoding: number }>(
        `SELECT vote_encoding, count(*)::int AS count
           FROM voting.accepted_votes
          WHERE election_id = $1 AND configuration_version = $2
            AND protocol_version = $3 AND circuit_version = $4
          GROUP BY vote_encoding ORDER BY vote_encoding`,
        [
          electionId,
          election.configuration_version,
          election.protocol_version,
          election.circuit_version,
        ],
      );
      const expectedSqlTotals = tally.totalsByOption
        .filter((option) => option.count > 0)
        .map((option) => ({ count: option.count, vote_encoding: option.encoding }));
      const normalizedSqlTotals = sqlTotals.rows.map((row) => ({
        count: Number(row.count),
        vote_encoding: Number(row.vote_encoding),
      }));
      if (JSON.stringify(normalizedSqlTotals) !== JSON.stringify(expectedSqlTotals)) {
        throw fail('TALLY_INVARIANT_FAILED', 'SQL and canonical tally disagree.', 'conflict');
      }
      const existing = await client.query<{ tally: typeof tally; tally_digest: string }>(
        `SELECT tally, tally_digest FROM result.tally_manifests
          WHERE election_id = $1 AND configuration_version = $2`,
        [electionId, election.configuration_version],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].tally_digest !== tally.tallyDigest) {
          throw fail('TALLY_DIGEST_MISMATCH', 'Persisted tally digest does not match.', 'conflict');
        }
        await client.query('COMMIT');
        return existing.rows[0].tally;
      }
      await client.query(
        `INSERT INTO result.tally_manifests
          (accepted_vote_count, accepted_vote_set_digest, configuration_version, created_at,
           election_id, protocol_version, status, tally, tally_digest, tally_version)
         VALUES ($1,$2,$3,clock_timestamp(),$4,$5,'VALIDATED',$6::jsonb,$7,$8)`,
        [
          tally.acceptedVoteCount,
          tally.acceptedVoteSetDigest,
          tally.configurationVersion,
          electionId,
          tally.protocolVersion,
          JSON.stringify(tally),
          tally.tallyDigest,
          tally.tallyVersion,
        ],
      );
      for (const eventType of ['tally_computed', 'tally_validated'] as const) {
        await appendAuditEventPg(client, {
          actorId: principal.adminId,
          actorType: 'ADMIN',
          aggregateId: electionId,
          aggregateType: 'election',
          eventType,
          eventVersion: 1,
          payload: {
            acceptedVoteCount: tally.acceptedVoteCount,
            acceptedVoteSetDigest: tally.acceptedVoteSetDigest,
            electionId,
            tallyDigest: tally.tallyDigest,
          },
          streamId: `election:${electionId}`,
        });
      }
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

  async startCounting(electionId: string, principal: AdminPrincipal) {
    await this.enterCounting(electionId, principal);
    return this.computeTally(electionId, principal);
  }

  async generatePackage(electionId: string, principal: AdminPrincipal) {
    const existingPackage = await this.pool.query<{
      content_digest: string;
      package_path: string;
      package_version: string;
      result: ElectionResultV1;
      verification_report: VerificationReportV1;
    }>(
      `SELECT package.content_digest, package.package_path, package.package_version,
              package.verification_report, official.result
         FROM result.verification_packages package
         JOIN result.election_results official ON official.election_id = package.election_id
          AND official.result_version = package.result_version
        WHERE package.election_id = $1
        ORDER BY package.result_version DESC LIMIT 1`,
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
        result: existing.result,
      };
    }
    const electionQuery = await this.pool.query<ElectionResultRow>(
      `SELECT id AS election_id, status, configuration_version, protocol_version,
              circuit_version, voting_method FROM election.elections WHERE id = $1`,
      [electionId],
    );
    const election = electionQuery.rows[0];
    if (!election) throw fail('ELECTION_NOT_FOUND', 'Election not found.', 'not-found');
    if (election.status !== 'COUNTING') {
      throw fail('INVALID_ELECTION_TRANSITION', 'Election must be counting.', 'domain-rule');
    }
    const manifestEnvelope = await this.getManifest(electionId);
    const votesResult = await this.pool.query<VoteEvidenceRow>(VOTES_SQL, [
      electionId,
      election.configuration_version,
      election.protocol_version,
      election.circuit_version,
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
    const tallyResult = await this.pool.query<{ status: string; tally: TallyManifestV1 }>(
      `SELECT status, tally FROM result.tally_manifests
        WHERE election_id = $1 AND configuration_version = $2`,
      [electionId, election.configuration_version],
    );
    if (
      !snapshotResult.rows[0] ||
      !tallyResult.rows[0] ||
      !['VALIDATED', 'PUBLISHED'].includes(tallyResult.rows[0].status)
    ) {
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
    const baseFiles: Record<string, string | Uint8Array> = {
      'README.md':
        '# Paquete de verificación electoral\n\n' +
        'Los schemas versionados están en `packages/verification-protocol/schemas`. ' +
        '`verification-package-manifest.json` enumera cada archivo con SHA-256 y tamaño; ' +
        'los JSON/JSONL usan la canonicalización V1 documentada por el protocolo.\n\n' +
        'Ejecute `pnpm verify:election -- --package <directorio>`. El verifier comprueba ' +
        'integridad de archivos, manifest/protocolo, proofs publicados, unicidad de nullifiers, ' +
        'digest del conjunto, tally determinista, resultado y checkpoints.\n\n' +
        'No demuestra distribución universal de credenciales, ausencia de coerción, seguridad ' +
        'del dispositivo o autenticidad institucional sin firma/anchoring externo. El paquete no ' +
        'contiene PII ni timestamps individuales de voto; publica nullifiers, receipts y proofs ' +
        'necesarios para verificación independiente.\n',
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
      'tally.json': canonicalJsonFileV1(tallyResult.rows[0].tally as unknown as CanonicalValue),
      'verification_key.json': verificationKeyBytes,
    };
    const evidenceEntries = packageEntries(baseFiles);
    const evidenceDigest = verificationPackageContentDigestV1(evidenceEntries);
    const versionResult = await this.pool.query<{
      next_version: number;
      previous_result_digest: string | null;
      published_at: Date;
    }>(
      `SELECT COALESCE(max(result_version), 0)::int + 1 AS next_version,
              (array_agg(result_content_digest ORDER BY result_version DESC))[1] AS previous_result_digest,
              clock_timestamp() AS published_at
         FROM result.election_results WHERE election_id = $1`,
      [electionId],
    );
    const version = versionResult.rows[0]!;
    const officialResult = electionResultV1({
      manifest: manifestEnvelope.manifest,
      previousResultDigest: version.previous_result_digest,
      publishedAt: version.published_at.toISOString(),
      resultVersion: version.next_version,
      tally: tallyResult.rows[0].tally,
      verificationPackageDigest: evidenceDigest,
    });
    const files: Record<string, string | Uint8Array> = {
      ...baseFiles,
      'result.json': canonicalJsonFileV1(officialResult as unknown as CanonicalValue),
    };
    const entries = packageEntries(files);
    const contentDigest = verificationPackageContentDigestV1(entries);
    const packageManifest: VerificationPackageManifestV1 = {
      electionId,
      evidenceDigest,
      files: entries,
      packageContentDigest: contentDigest,
      packageVersion: PACKAGE_VERSION_V1,
      resultVersion: version.next_version,
    };
    files['verification-package-manifest.json'] = canonicalJsonFileV1(
      packageManifest as unknown as CanonicalValue,
    );
    const packagePath = await this.store.putImmutable(
      electionId,
      version.next_version,
      contentDigest,
      files,
    );
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
        `INSERT INTO result.election_results
          (accepted_vote_set_digest, configuration_version, election_id, previous_result_digest,
           protocol_version, publication_digest, published_at, result, result_content_digest,
           result_schema_version, result_version, status, tally_digest, total_accepted_votes,
           verification_package_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,'VALIDATED',$12,$13,$14)`,
        [
          officialResult.acceptedVoteSetDigest,
          officialResult.configurationVersion,
          electionId,
          officialResult.previousResultDigest,
          officialResult.protocolVersion,
          officialResult.publicationDigest,
          new Date(officialResult.publishedAt),
          JSON.stringify(officialResult),
          officialResult.resultContentDigest,
          officialResult.resultSchemaVersion,
          officialResult.resultVersion,
          officialResult.tallyDigest,
          officialResult.totalAcceptedVotes,
          officialResult.verificationPackageDigest,
        ],
      );
      await client.query(
        `INSERT INTO result.result_publications
          (created_at, election_id, package_content_digest, result_version, status, updated_at)
         VALUES (clock_timestamp(),$1,$2,$3,'GENERATED',clock_timestamp())`,
        [electionId, contentDigest, version.next_version],
      );
      const sizeBytes = Object.values(files).reduce(
        (total, bytes) =>
          total + (typeof bytes === 'string' ? Buffer.byteLength(bytes) : bytes.byteLength),
        0,
      );
      await client.query(
        `INSERT INTO result.verification_packages
         (configuration_version, content_digest, created_at, election_id, evidence_digest,
           package_path, package_version, result_version, size_bytes, status,
           verification_report, verified_at)
         VALUES ($1,$2,clock_timestamp(),$3,$4,$5,$6,$7,$8,'GENERATED',$9::jsonb,clock_timestamp())`,
        [
          election.configuration_version,
          contentDigest,
          electionId,
          evidenceDigest,
          packagePath,
          PACKAGE_VERSION_V1,
          version.next_version,
          sizeBytes,
          JSON.stringify(report),
        ],
      );
      const packageEvent = {
        actorId: principal.adminId,
        actorType: 'ADMIN' as const,
        aggregateId: electionId,
        aggregateType: 'election',
        eventVersion: 1 as const,
        payload: {
          configurationVersion: election.configuration_version,
          contentDigest,
          electionId,
          resultVersion: version.next_version,
        },
        streamId: `election:${electionId}`,
      };
      await appendAuditEventPg(client, {
        ...packageEvent,
        eventType: 'verification_package_generated',
      });
      await client.query(
        `UPDATE result.verification_packages SET status = 'VERIFIED'
          WHERE election_id = $1 AND result_version = $2`,
        [electionId, version.next_version],
      );
      await client.query(
        `UPDATE result.result_publications SET status = 'VERIFIED', updated_at = clock_timestamp()
          WHERE election_id = $1 AND result_version = $2`,
        [electionId, version.next_version],
      );
      await appendAuditEventPg(client, {
        ...packageEvent,
        eventType: 'verification_package_verified',
      });
      await createCheckpointPg(client, `election:${electionId}`);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return {
      contentDigest,
      packageVersion: PACKAGE_VERSION_V1,
      report,
      result: officialResult,
    };
  }

  async publishResults(electionId: string, principal: AdminPrincipal) {
    type PublicationRow = ElectionResultRow & {
      content_digest: string;
      package_path: string;
      package_status: string;
      publication_status: string;
      result: ElectionResultV1;
      result_status: string;
      result_version: number;
      verification_report: VerificationReportV1;
    };
    const selectPublication = `SELECT e.id AS election_id, e.status, e.configuration_version,
              e.protocol_version, e.circuit_version, e.voting_method, package.content_digest,
              package.package_path, package.status AS package_status,
              package.verification_report, publication.status AS publication_status,
              official.result, official.status AS result_status, official.result_version
         FROM election.elections e
         JOIN result.election_results official ON official.election_id = e.id
         JOIN result.verification_packages package ON package.election_id = e.id
          AND package.result_version = official.result_version
         JOIN result.result_publications publication ON publication.election_id = e.id
          AND publication.result_version = official.result_version
        WHERE e.id = $1
        ORDER BY official.result_version DESC LIMIT 1`;

    const beginClient = await this.pool.connect();
    let publication: PublicationRow;
    try {
      await beginClient.query('BEGIN');
      const result = await beginClient.query<PublicationRow>(
        `${selectPublication} FOR UPDATE OF e, official, package, publication`,
        [electionId],
      );
      const row = result.rows[0];
      if (!row)
        throw fail('RESULT_EVIDENCE_MISSING', 'Verified result evidence is missing.', 'conflict');
      if (row.status === 'RESULTS_PUBLISHED' && row.result_status === 'PUBLISHED') {
        await beginClient.query('COMMIT');
        return row.result;
      }
      if (
        row.status !== 'COUNTING' ||
        row.result_status !== 'VALIDATED' ||
        row.package_status !== 'VERIFIED' ||
        !['VERIFIED', 'FAILED', 'PUBLISHING'].includes(row.publication_status) ||
        row.verification_report.valid !== true
      ) {
        throw fail(
          'RESULT_PUBLICATION_REJECTED',
          'Verified results cannot be published.',
          'domain-rule',
        );
      }
      if (row.publication_status !== 'PUBLISHING') {
        await beginClient.query(
          `UPDATE result.result_publications
              SET status = 'PUBLISHING', failure_code = NULL, updated_at = clock_timestamp()
            WHERE election_id = $1 AND result_version = $2`,
          [electionId, row.result_version],
        );
        await appendAuditEventPg(beginClient, {
          actorId: principal.adminId,
          actorType: 'ADMIN',
          aggregateId: electionId,
          aggregateType: 'election',
          eventType: 'result_publication_started',
          eventVersion: 1,
          payload: { electionId, resultVersion: row.result_version },
          streamId: `election:${electionId}`,
        });
        await createCheckpointPg(beginClient, `election:${electionId}`);
      }
      await beginClient.query('COMMIT');
      publication = row;
    } catch (error: unknown) {
      await beginClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      beginClient.release();
    }

    const freshReport = await verifyElectionPackage(publication.package_path);
    if (!freshReport.valid || freshReport.packageContentDigest !== publication.content_digest) {
      const failedClient = await this.pool.connect();
      try {
        await failedClient.query('BEGIN');
        await failedClient.query(
          `UPDATE result.result_publications
              SET status = 'FAILED', failure_code = 'VERIFICATION_PACKAGE_INVALID',
                  updated_at = clock_timestamp()
            WHERE election_id = $1 AND result_version = $2 AND status = 'PUBLISHING'`,
          [electionId, publication.result_version],
        );
        await appendAuditEventPg(failedClient, {
          actorId: principal.adminId,
          actorType: 'ADMIN',
          aggregateId: electionId,
          aggregateType: 'election',
          eventType: 'result_publication_failed',
          eventVersion: 1,
          payload: {
            electionId,
            errorCode: 'VERIFICATION_PACKAGE_INVALID',
            resultVersion: publication.result_version,
          },
          streamId: `election:${electionId}`,
        });
        await createCheckpointPg(failedClient, `election:${electionId}`);
        await failedClient.query('COMMIT');
      } catch (error: unknown) {
        await failedClient.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        failedClient.release();
      }
      throw fail(
        'RESULT_PUBLICATION_REJECTED',
        'Verification package no longer validates.',
        'domain-rule',
      );
    }

    const publishClient = await this.pool.connect();
    try {
      await publishClient.query('BEGIN');
      const currentResult = await publishClient.query<PublicationRow>(
        `${selectPublication} FOR UPDATE OF e, official, package, publication`,
        [electionId],
      );
      const current = currentResult.rows[0];
      if (!current)
        throw fail('RESULT_EVIDENCE_MISSING', 'Verified result evidence is missing.', 'conflict');
      if (current.status === 'RESULTS_PUBLISHED' && current.result_status === 'PUBLISHED') {
        await publishClient.query('COMMIT');
        return current.result;
      }
      if (
        current.status !== 'COUNTING' ||
        current.result_status !== 'VALIDATED' ||
        current.package_status !== 'VERIFIED' ||
        current.publication_status !== 'PUBLISHING' ||
        current.result_version !== publication.result_version ||
        current.content_digest !== publication.content_digest
      ) {
        throw fail('RESULT_VERSION_CONFLICT', 'Result changed during publication.', 'conflict');
      }
      const now = new Date(current.result.publishedAt);
      await publishClient.query(
        `UPDATE result.election_results SET status = 'PUBLISHED'
          WHERE election_id = $1 AND result_version = $2`,
        [electionId, current.result_version],
      );
      await publishClient.query(
        `UPDATE result.tally_manifests SET status = 'PUBLISHED'
          WHERE election_id = $1 AND configuration_version = $2`,
        [electionId, current.configuration_version],
      );
      await publishClient.query(
        `UPDATE result.verification_packages SET status = 'PUBLISHED'
          WHERE election_id = $1 AND result_version = $2`,
        [electionId, current.result_version],
      );
      await publishClient.query(
        `UPDATE result.result_publications
            SET status = 'PUBLISHED', failure_code = NULL, updated_at = clock_timestamp()
          WHERE election_id = $1 AND result_version = $2`,
        [electionId, current.result_version],
      );
      await publishClient.query(
        `UPDATE election.elections SET status = 'RESULTS_PUBLISHED', row_version = row_version + 1,
                updated_at = $2 WHERE id = $1`,
        [electionId, now],
      );
      await publishClient.query(
        `INSERT INTO election.election_state_event
          (actor_admin_id, configuration_version, election_id, new_state, occurred_at, previous_state)
         VALUES ($1,$2,$3,'RESULTS_PUBLISHED',$4,'COUNTING')`,
        [principal.adminId, current.configuration_version, electionId, now],
      );
      await appendAuditEventPg(publishClient, {
        actorId: principal.adminId,
        actorType: 'ADMIN',
        aggregateId: electionId,
        aggregateType: 'election',
        eventType: 'results_published',
        eventVersion: 1,
        payload: {
          configurationVersion: current.configuration_version,
          contentDigest: current.content_digest,
          electionId,
          resultVersion: current.result_version,
        },
        streamId: `election:${electionId}`,
      });
      await createCheckpointPg(publishClient, `election:${electionId}`);
      await publishClient.query('COMMIT');
      return current.result;
    } catch (error: unknown) {
      await publishClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      publishClient.release();
    }
  }

  async getVerification(electionId: string) {
    const result = await this.pool.query<VerificationMetadataRow>(
      `SELECT content_digest AS "contentDigest", created_at AS "createdAt",
              package_version AS "packageVersion", verification_report AS report,
              result_version AS "resultVersion"
         FROM result.verification_packages
        WHERE election_id = $1 AND status = 'PUBLISHED'
        ORDER BY result_version DESC LIMIT 1`,
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
      `SELECT package_path FROM result.verification_packages
        WHERE election_id = $1 AND status = 'PUBLISHED'
        ORDER BY result_version DESC LIMIT 1`,
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

  async getResults(electionId: string, resultVersion?: number) {
    const result = await this.pool.query<{ result: ElectionResultV1 }>(
      `SELECT result FROM result.election_results
        WHERE election_id = $1 AND status = 'PUBLISHED'
          AND ($2::integer IS NULL OR result_version = $2)
        ORDER BY result_version DESC LIMIT 1`,
      [electionId, resultVersion ?? null],
    );
    if (!result.rows[0])
      throw fail('RESULTS_NOT_PUBLISHED', 'Results are not published.', 'not-found');
    return result.rows[0].result;
  }

  async getReceipt(electionId: string, receiptCommitment: string) {
    const result = await this.pool.query<ReceiptPublicRow>(
      `SELECT vote.nullifier, vote.receipt_commitment AS "receiptCommitment",
              vote.receipt_version AS "receiptVersion"
         FROM voting.accepted_votes vote
         JOIN result.verification_packages package ON package.election_id = vote.election_id
          AND package.configuration_version = vote.configuration_version
        WHERE vote.election_id = $1 AND vote.receipt_commitment = $2
          AND package.status = 'PUBLISHED'`,
      [electionId, receiptCommitment],
    );
    if (!result.rows[0]) throw fail('RECEIPT_NOT_FOUND', 'Receipt not found.', 'not-found');
    return result.rows[0];
  }
}
