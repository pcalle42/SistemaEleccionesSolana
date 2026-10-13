import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { evaluateClockDrift } from '../../scripts/operations/check-clock-drift.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const requiredRunbooks = [
  'api-unavailable.md',
  'artifact-digest-mismatch.md',
  'backup-failure.md',
  'clock-drift.md',
  'election-open-incident.md',
  'high-error-rate.md',
  'high-latency.md',
  'pitr.md',
  'postgres-disk-pressure.md',
  'postgres-unavailable.md',
  'post-election-verification-failure.md',
  'release-rollback.md',
  'restore.md',
  'security-incident.md',
  'valkey-unavailable.md',
  'zk-verifier-failure.md',
];
let temporaryDirectory: string;

describe('operational contracts', () => {
  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'votaciones-operations-'));
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true });
  });

  it('keeps metric labels aggregate and exports every required voting signal', async () => {
    const source = await readFile(
      join(repositoryRoot, 'apps/api/src/observability/metrics.service.ts'),
      'utf8',
    );
    for (const metric of [
      'http_requests_total',
      'http_request_duration_seconds',
      'vote_requests_total',
      'vote_rejected_total',
      'vote_duplicate_total',
      'vote_proof_verification_duration_seconds',
      'vote_accept_transaction_duration_seconds',
      'proof_verification_inflight',
      'proof_verification_timeout_total',
    ]) {
      expect(source).toContain(`'${metric}'`);
    }
    expect(source).not.toMatch(
      /\{\s*(?:credentialId|electionId|nullifier|receipt|sessionId|voterId)\s*:/u,
    );
  });

  it('documents every mandatory runbook with the safe response structure', async () => {
    for (const runbook of requiredRunbooks) {
      const content = await readFile(
        join(repositoryRoot, 'docs/operations/runbooks', runbook),
        'utf8',
      );
      for (const heading of [
        'Síntomas',
        'Impacto',
        'Alertas',
        'Checks seguros',
        'Contención y recuperación',
        'Verificación',
        'Escalamiento',
        'Acciones prohibidas',
        'Evidencia a preservar',
      ]) {
        expect(content).toContain(`## ${heading}`);
      }
      expect(content).not.toMatch(/DROP DATABASE|borrar votos|regenerar (?:el )?zkey/iu);
    }
  });

  it('maps every critical alert to a runbook and forbids live election detail', async () => {
    const alertContract = JSON.parse(
      await readFile(join(repositoryRoot, 'ops/observability/alerts.v1.json'), 'utf8'),
    ) as { alerts: { runbook: string; severity: string }[] };
    expect(alertContract.alerts.length).toBeGreaterThanOrEqual(10);
    for (const alert of alertContract.alerts) {
      expect(['SEV1', 'SEV2', 'SEV3', 'SEV4']).toContain(alert.severity);
      expect(requiredRunbooks).toContain(alert.runbook.split('/').at(-1));
    }

    const dashboards = await readFile(
      join(repositoryRoot, 'ops/observability/dashboards.v1.json'),
      'utf8',
    );
    expect(dashboards).toContain('"forbiddenWhileOpen"');
    expect(dashboards).not.toMatch(/credential|voterSecret|publicSignals/iu);
  });

  it('creates immutable backup metadata and detects archive tampering', async () => {
    const archive = join(temporaryDirectory, 'sample.dump');
    await writeFile(archive, 'synthetic-backup');
    execFileSync(
      process.execPath,
      [
        'scripts/operations/backup-metadata.mjs',
        '--archive',
        archive,
        '--environment',
        'test',
        '--kind',
        'postgresql',
        '--evidence',
        '{"acceptedVoteCount":0}',
      ],
      { cwd: repositoryRoot },
    );
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/operations/verify-backup.mjs', '--archive', archive, '--kind', 'postgresql'],
        { cwd: repositoryRoot, stdio: 'pipe' },
      ),
    ).not.toThrow();
    await writeFile(archive, 'tampered-backup');
    expect(
      spawnSync(
        process.execPath,
        ['scripts/operations/verify-backup.mjs', '--archive', archive, '--kind', 'postgresql'],
        { cwd: repositoryRoot },
      ).status,
    ).not.toBe(0);
  });

  it('backs up and restores verification artifacts by digest', async () => {
    const source = join(temporaryDirectory, 'artifact-source');
    const restored = join(temporaryDirectory, 'artifact-restored');
    const archive = join(temporaryDirectory, 'artifact-backup.tar.gz');
    await mkdir(join(source, 'protocol-v1'), { recursive: true });
    await writeFile(join(source, 'protocol-v1', 'verification_key.json'), '{"curve":"bn128"}\n');

    execFileSync('bash', ['infra/scripts/backup-artifacts.sh', '--', source, archive, 'test'], {
      cwd: repositoryRoot,
    });
    execFileSync('bash', ['infra/scripts/restore-artifacts.sh', '--', archive, restored], {
      cwd: repositoryRoot,
    });

    await expect(
      readFile(join(restored, 'protocol-v1', 'verification_key.json'), 'utf8'),
    ).resolves.toBe('{"curve":"bn128"}\n');
  });

  it('calculates clock drift against the request midpoint', () => {
    expect(
      evaluateClockDrift({
        finishedAtMs: Date.parse('2030-01-01T00:00:00.200Z'),
        referenceDate: 'Tue, 01 Jan 2030 00:00:00 GMT',
        startedAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
      }),
    ).toEqual({ driftMs: 100, roundTripMs: 200 });
  });
});
