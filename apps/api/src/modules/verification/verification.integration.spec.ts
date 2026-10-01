import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CIRCUIT_VERSION_V1, PROTOCOL_VERSION_V1 } from '@votaciones/zk-protocol';
import { verifyElectionPackage } from '@votaciones/verification-protocol';

import { getAppConfig } from '../../config/app-config.js';
import { createDatabase } from '../../database/client.js';
import { createDatabasePool } from '../../database/pool.js';
import type { Clock } from '../elections/domain/clock.js';
import { Election } from '../elections/domain/election.js';
import { electionId, electionOptionId } from '../elections/domain/election-id.js';
import { DrizzleElectionRepository } from '../elections/infrastructure/persistence/drizzle-election.repository.js';
import { VerificationService } from './application/verification.service.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const repository = new DrizzleElectionRepository(createDatabase(runtimePool));
const adminId = randomUUID();
let now = new Date('2030-01-01T10:00:00.000Z');
const clock: Clock = { now: () => new Date(now) };
let artifactDirectory = '';
let service: VerificationService;

async function clearData() {
  await migrationPool.query('DELETE FROM result.verification_packages');
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
  it('freezes, tallies, packages, verifies, and publishes without voter PII', async () => {
    const election = Election.create(
      {
        closesAt: new Date('2030-01-01T13:00:00.000Z'),
        id: electionId(randomUUID()),
        opensAt: new Date('2030-01-01T11:00:00.000Z'),
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
       VALUES ('poseidon-bn254-v1',1,$1,$2,$1,$3,1,'123','FROZEN',20,1)`,
      [now, election.snapshot().id, randomUUID()],
    );
    let event = election.prepare(adminId, clock);
    await repository.transitionState(election, event, 0);
    const envelope = await service.getManifest(election.snapshot().id);
    expect(envelope.manifest.electionContext).toMatch(/^[0-9]+$/u);

    now = new Date('2030-01-01T12:00:00.000Z');
    event = election.open(adminId, clock);
    await repository.transitionState(election, event, 1);
    event = election.close(adminId, clock);
    await repository.transitionState(election, event, 2);

    const tally = await service.startCounting(election.snapshot().id, {
      adminId,
      authSessionId: randomUUID(),
    });
    expect(tally).toMatchObject({ acceptedVoteCount: 0, invalidAcceptedVoteCount: 0 });
    const generated = await service.generatePackage(election.snapshot().id, {
      adminId,
      authSessionId: randomUUID(),
    });
    expect(generated).toMatchObject({ report: { valid: true } });
    await expect(
      service.generatePackage(election.snapshot().id, {
        adminId,
        authSessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ contentDigest: generated.contentDigest });
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
    const tamperedDirectory = await mkdtemp(join(tmpdir(), 'votaciones-tampered-'));
    await cp(stored.rows[0]!.package_path, tamperedDirectory, { recursive: true });
    await writeFile(join(tamperedDirectory, 'tally.json'), '{}\n');
    await expect(verifyElectionPackage(tamperedDirectory)).resolves.toMatchObject({
      valid: false,
    });
    await rm(tamperedDirectory, { force: true, recursive: true });
    const published = await service.publishResults(election.snapshot().id, {
      adminId,
      authSessionId: randomUUID(),
    });
    expect(published).toMatchObject({ acceptedVoteCount: 0 });
    await expect(
      service.publishResults(election.snapshot().id, {
        adminId,
        authSessionId: randomUUID(),
      }),
    ).resolves.toMatchObject({ acceptedVoteCount: 0 });
    await expect(service.getResults(election.snapshot().id)).resolves.toMatchObject({
      acceptedVoteCount: 0,
    });
  });
});
