import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMerkleTreeV1,
  CIRCUIT_VERSION_V1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  protocolArtifactLocationsV1,
  PROTOCOL_VERSION_V1,
} from '@votaciones/zk-protocol';
import { verifyElectionPackage } from '@votaciones/verification-protocol';
import { groth16 } from 'snarkjs';

import { getAppConfig } from '../../config/app-config.js';
import { createDatabase } from '../../database/client.js';
import { createDatabasePool } from '../../database/pool.js';
import type { Clock } from '../elections/domain/clock.js';
import { Election } from '../elections/domain/election.js';
import { electionId, electionOptionId } from '../elections/domain/election-id.js';
import { DrizzleElectionRepository } from '../elections/infrastructure/persistence/drizzle-election.repository.js';
import { submissionFingerprintV1 } from '../voting/domain/vote-receipt.js';
import { PostgresVoteRepository } from '../voting/infrastructure/persistence/postgres-vote.repository.js';
import { VerificationService } from './application/verification.service.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const repository = new DrizzleElectionRepository(createDatabase(runtimePool));
const voteRepository = new PostgresVoteRepository(runtimePool);
const adminId = randomUUID();
let now = new Date('2030-01-01T10:00:00.000Z');
const clock: Clock = { now: () => new Date(now) };
let artifactDirectory = '';
let service: VerificationService;

async function clearData() {
  await migrationPool.query('DELETE FROM result.result_publications');
  await migrationPool.query('DELETE FROM result.verification_packages');
  await migrationPool.query('DELETE FROM result.election_results');
  await migrationPool.query('DELETE FROM result.tally_manifests');
  await migrationPool.query('DELETE FROM result.accepted_vote_set_snapshots');
  await migrationPool.query('DELETE FROM result.election_manifests');
  await migrationPool.query('DELETE FROM audit.audit_checkpoint');
  await migrationPool.query('DELETE FROM audit.audit_event');
  await migrationPool.query('DELETE FROM audit.audit_chain_head');
  await migrationPool.query('DELETE FROM voting.vote_proof_evidence');
  await migrationPool.query('DELETE FROM voting.accepted_votes');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshot_members');
  await migrationPool.query('DELETE FROM eligibility.eligibility_snapshots');
  await migrationPool.query('DELETE FROM election.election_state_event');
  await migrationPool.query('DELETE FROM election.election_configuration_versions');
  await migrationPool.query('DELETE FROM election.election_options');
  await migrationPool.query('DELETE FROM election.elections');
}

beforeAll(async () => {
  await clearData();
  await migrationPool.query('DELETE FROM admin.admin_account');
  await migrationPool.query(
    `INSERT INTO admin.admin_account (id, username, password_hash)
     VALUES ($1, 'verification-integration-admin', 'not-used')`,
    [adminId],
  );
  artifactDirectory = await mkdtemp(join(tmpdir(), 'votaciones-verification-'));
  const config = getAppConfig({
    DATABASE_URL: process.env['DATABASE_URL'],
    VALKEY_HOST: '127.0.0.1',
    VERIFICATION_ARTIFACT_DIRECTORY: artifactDirectory,
    VOTACIONES_ENV: 'test',
  });
  service = new VerificationService(runtimePool, config);
});

afterAll(async () => {
  await clearData();
  await migrationPool.query('DELETE FROM admin.admin_account WHERE id = $1', [adminId]);
  await runtimePool.end();
  await migrationPool.end();
  await rm(artifactDirectory, { force: true, recursive: true });
});

describe('verifiable result lifecycle', () => {
  it('accepts, freezes, tallies, packages, verifies, and publishes a real vote without voter PII', async () => {
    const voterSecret = '987654321012345678909876543210123456789';
    const identityCommitment = await deriveIdentityCommitmentV1(voterSecret);
    const tree = await buildMerkleTreeV1([
      identityCommitment,
      await deriveIdentityCommitmentV1('2'),
    ]);
    const election = Election.create(
      {
        closesAt: new Date('2035-01-01T13:00:00.000Z'),
        id: electionId(randomUUID()),
        opensAt: new Date('2025-01-01T11:00:00.000Z'),
        options: [
          { displayOrder: 0, id: electionOptionId(randomUUID()), label: 'A' },
          { displayOrder: 1, id: electionOptionId(randomUUID()), label: 'B' },
        ],
        references: {
          circuitVersion: CIRCUIT_VERSION_V1,
          eligibilityConfigurationRef: 'eligibility-v1',
          protocolVersion: PROTOCOL_VERSION_V1,
        },
        title: 'Verification lifecycle',
      },
      clock,
    );
    await repository.create(election, adminId);
    await migrationPool.query(
      `INSERT INTO eligibility.eligibility_snapshots
        (commitment_scheme_version, configuration_version, created_at, election_id, frozen_at,
         id, leaf_count, merkle_root, status, tree_depth, version)
       VALUES ('poseidon-bn254-v1',1,$1,$2,$1,$3,2,$4,'FROZEN',20,1)`,
      [now, election.snapshot().id, randomUUID(), tree.root],
    );
    let event = election.prepare(adminId, clock);
    await repository.transitionState(election, event, 0);
    const envelope = await service.getManifest(election.snapshot().id);
    expect(envelope.manifest.electionContext).toMatch(/^[0-9]+$/u);

    now = new Date('2030-01-01T12:00:00.000Z');
    event = election.open(adminId, clock);
    await repository.transitionState(election, event, 1);

    const context = await voteRepository.loadAcceptanceContext(election.snapshot().id);
    expect(context).not.toBeNull();
    const membership = tree.proof(tree.leaves.indexOf(identityCommitment));
    const nullifier = await deriveNullifierV1(voterSecret, envelope.manifest.electionContext);
    const artifacts = protocolArtifactLocationsV1();
    const generated = await groth16.fullProve(
      {
        electionContext: envelope.manifest.electionContext,
        merklePathElements: [...membership.pathElements],
        merklePathIndices: [...membership.pathIndices],
        merkleRoot: tree.root,
        nullifier,
        optionCount: 2,
        voteChoice: 1,
        voterSecret,
      },
      artifacts.wasm.pathname,
      artifacts.zkey.pathname,
    );
    const publicSignals = generated.publicSignals.map(String);
    const accepted = await voteRepository.accept({
      context: context!,
      nullifier,
      proof: generated.proof,
      publicSignals,
      submissionFingerprint: submissionFingerprintV1({
        electionContext: envelope.manifest.electionContext,
        merkleRoot: tree.root,
        nullifier,
        protocolVersion: PROTOCOL_VERSION_V1,
        voteEncoding: 1,
      }),
      voteEncoding: 1,
    });

    event = election.close(adminId, clock);
    await repository.transitionState(election, event, 2);

    const principal = () => ({ adminId, authSessionId: randomUUID() });
    const [firstSnapshot, retrySnapshot] = await Promise.all([
      service.enterCounting(election.snapshot().id, principal()),
      service.enterCounting(election.snapshot().id, principal()),
    ]);
    expect(retrySnapshot).toEqual(firstSnapshot);
    const frozenRows = await migrationPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM result.accepted_vote_set_snapshots
        WHERE election_id = $1`,
      [election.snapshot().id],
    );
    expect(frozenRows.rows[0]?.count).toBe(1);
    await expect(service.getResults(election.snapshot().id)).rejects.toMatchObject({
      code: 'RESULTS_NOT_PUBLISHED',
    });

    const [tally, retryTally] = await Promise.all([
      service.computeTally(election.snapshot().id, principal()),
      service.computeTally(election.snapshot().id, principal()),
    ]);
    expect(retryTally).toEqual(tally);
    expect(tally).toMatchObject({ acceptedVoteCount: 1, invalidAcceptedVoteCount: 0 });
    expect(tally.totalsByOption).toEqual([
      expect.objectContaining({ count: 0, encoding: 0 }),
      expect.objectContaining({ count: 1, encoding: 1 }),
    ]);
    const tallyRows = await migrationPool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM result.tally_manifests WHERE election_id = $1`,
      [election.snapshot().id],
    );
    expect(tallyRows.rows[0]?.count).toBe(1);
    const packageResult = await service.generatePackage(election.snapshot().id, {
      adminId,
      authSessionId: randomUUID(),
    });
    expect(packageResult).toMatchObject({ report: { valid: true } });
    await expect(service.getVerification(election.snapshot().id)).rejects.toMatchObject({
      code: 'VERIFICATION_PACKAGE_NOT_FOUND',
    });
    await expect(
      service.generatePackage(election.snapshot().id, {
        adminId,
        authSessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ contentDigest: packageResult.contentDigest });
    const stored = await migrationPool.query<{ package_path: string }>(
      'SELECT package_path FROM result.verification_packages WHERE election_id = $1',
      [election.snapshot().id],
    );
    const publishedBytes = await Promise.all(
      (await readdir(stored.rows[0]!.package_path)).map((name) =>
        readFile(join(stored.rows[0]!.package_path, name), 'utf8'),
      ),
    );
    const publicPackageText = publishedBytes.join('\n');
    expect(publicPackageText).not.toContain('verification-integration-admin');
    expect(publicPackageText).not.toContain('not-used');
    expect(publicPackageText).not.toContain(adminId);
    expect(publicPackageText).not.toContain('acceptedAt');
    for (const file of [
      'accepted-votes.jsonl',
      'checkpoints.json',
      'election-manifest.json',
      'result.json',
      'tally.json',
      'verification_key.json',
    ]) {
      const path = join(stored.rows[0]!.package_path, file);
      const original = await readFile(path);
      await writeFile(path, Buffer.concat([original, Buffer.from('\n')]));
      await expect(verifyElectionPackage(stored.rows[0]!.package_path)).resolves.toMatchObject({
        valid: false,
      });
      await writeFile(path, original);
    }
    const tallyPath = join(stored.rows[0]!.package_path, 'tally.json');
    const originalTally = await readFile(tallyPath);
    await writeFile(tallyPath, '{}\n');
    await expect(verifyElectionPackage(stored.rows[0]!.package_path)).resolves.toMatchObject({
      valid: false,
    });
    await expect(service.publishResults(election.snapshot().id, principal())).rejects.toMatchObject(
      { code: 'RESULT_PUBLICATION_REJECTED' },
    );
    await expect(service.getResults(election.snapshot().id)).rejects.toMatchObject({
      code: 'RESULTS_NOT_PUBLISHED',
    });
    await expect(
      migrationPool.query(
        `SELECT election.status, publication.status AS publication_status
           FROM election.elections election
           JOIN result.result_publications publication ON publication.election_id = election.id
          WHERE election.id = $1`,
        [election.snapshot().id],
      ),
    ).resolves.toMatchObject({
      rows: [{ publication_status: 'FAILED', status: 'COUNTING' }],
    });
    await writeFile(tallyPath, originalTally);
    const published = await service.publishResults(election.snapshot().id, {
      adminId,
      authSessionId: randomUUID(),
    });
    expect(published).toMatchObject({ resultVersion: 1, totalAcceptedVotes: 1 });
    await expect(
      service.publishResults(election.snapshot().id, {
        adminId,
        authSessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ resultVersion: 1, totalAcceptedVotes: 1 });
    await expect(service.getResults(election.snapshot().id)).resolves.toMatchObject({
      resultVersion: 1,
      totalAcceptedVotes: 1,
    });
    await expect(service.getResults(election.snapshot().id, 1)).resolves.toMatchObject({
      resultVersion: 1,
    });
    await expect(
      service.getReceipt(election.snapshot().id, accepted.receipt.receiptCommitment),
    ).resolves.toMatchObject({
      nullifier,
      receiptCommitment: accepted.receipt.receiptCommitment,
    });
    const persisted = await migrationPool.query<{
      package_count: number;
      publication_count: number;
      result_count: number;
      status: string;
    }>(
      `SELECT election.status,
              (SELECT count(*)::int FROM result.verification_packages WHERE election_id = election.id) AS package_count,
              (SELECT count(*)::int FROM result.result_publications WHERE election_id = election.id) AS publication_count,
              (SELECT count(*)::int FROM result.election_results WHERE election_id = election.id) AS result_count
         FROM election.elections election WHERE election.id = $1`,
      [election.snapshot().id],
    );
    expect(persisted.rows[0]).toMatchObject({
      package_count: 1,
      publication_count: 1,
      result_count: 1,
      status: 'RESULTS_PUBLISHED',
    });
    const auditEvents = await migrationPool.query<{ event_type: string }>(
      `SELECT event_type FROM audit.audit_event
        WHERE stream_id = $1 ORDER BY sequence`,
      [`election:${election.snapshot().id}`],
    );
    expect(auditEvents.rows.map(({ event_type: eventType }) => eventType)).toEqual(
      expect.arrayContaining([
        'accepted_vote_set_frozen',
        'counting_started',
        'tally_computed',
        'tally_validated',
        'verification_package_generated',
        'verification_package_verified',
        'result_publication_started',
        'result_publication_failed',
        'results_published',
      ]),
    );
  });
});
