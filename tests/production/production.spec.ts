import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  type ProductionProfile,
  verifyProductionProfile,
} from '../../scripts/production/profile.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function template(): Promise<ProductionProfile> {
  return JSON.parse(
    await readFile(join(repositoryRoot, 'deploy/production-profile.template.json'), 'utf8'),
  ) as ProductionProfile;
}

async function approvedSyntheticProfile(): Promise<ProductionProfile> {
  const profile = await template();
  profile.synthetic = true;
  profile.profileId = 'synthetic_contract_test';
  profile.providerDecision = {
    adr: 'docs/adr/001-provider-approved.md',
    status: 'approved',
  };
  profile.topology.certificateLifecycleEvidence = 'evidence/certificates.json';
  profile.data.postgresql.backupScheduled = true;
  profile.data.postgresql.restoreTested = true;
  profile.data.postgresql.rpoMinutes = 15;
  profile.data.postgresql.rtoMinutes = 60;
  profile.data.valkey.lossTested = true;
  profile.artifacts = {
    backupEvidence: 'evidence/artifact-restore.json',
    digestVerified: true,
    durable: true,
    immutable: true,
    productionSafe: true,
    publicPrivateSeparated: true,
  };
  profile.secrets.audited = true;
  profile.secrets.rotationRunbook = 'docs/production/failure-behavior.md';
  for (const key of Object.keys(profile.iam)) profile.iam[key] = true;
  profile.deployment.rollbackPlan = 'docs/production/deployment-runbook.md';
  profile.operations.metricsProtected = true;
  profile.operations.alertsActive = true;
  profile.operations.clockEvidence = 'evidence/clock.json';
  profile.operations.restoreEvidence = 'evidence/restore.json';
  profile.operations.onCallDefined = true;
  profile.capacity = {
    baselineEvidence: 'evidence/capacity.json',
    headroomPercent: 50,
    peakVotesPerSecond: 10,
    status: 'approved',
  };
  for (const [gate, value] of Object.entries(profile.gates)) {
    value.status = 'approved';
    value.evidence = [`evidence/${gate.toLowerCase()}.json`];
  }
  return profile;
}

describe('production deployment contract', () => {
  it('rejects the deliberately pending profile template', async () => {
    await expect(verifyProductionProfile(await template())).rejects.toThrow(/not approved/iu);
  });

  it('never lets synthetic evidence authorize production', async () => {
    const profile = await approvedSyntheticProfile();
    await expect(verifyProductionProfile(profile)).rejects.toThrow(/synthetic/iu);
    await expect(verifyProductionProfile(profile, { allowSynthetic: true })).resolves.toMatchObject(
      {
        verified: true,
      },
    );
  });

  it('rejects an unsafe production boundary even with approved gates', async () => {
    const profile = await approvedSyntheticProfile();
    profile.data.postgresql.private = false;
    await expect(verifyProductionProfile(profile, { allowSynthetic: true })).rejects.toThrow(
      /PostgreSQL/iu,
    );
  });

  it('keeps the production API image free of devnet scripts and fixtures', async () => {
    const dockerfile = await readFile(join(repositoryRoot, 'apps/api/Dockerfile'), 'utf8');
    const runtime = dockerfile.slice(dockerfile.indexOf('FROM runtime-base AS runtime'));
    expect(runtime).not.toMatch(/COPY.*(?:fixtures\/devnet|scripts\/devnet)/u);
    expect(dockerfile).toContain('FROM runtime-base AS devnet');
  });

  it('builds production frontends with same-origin API defaults', async () => {
    for (const application of ['admin-web', 'voter-web']) {
      const dockerfile = await readFile(
        join(repositoryRoot, 'apps', application, 'Dockerfile'),
        'utf8',
      );
      expect(dockerfile).toContain('ARG VITE_API_BASE_URL=/api/v1');
      expect(dockerfile).toContain('ARG VITE_RUNTIME_ENV=production');
      expect(dockerfile).not.toContain('ENV API_ORIGIN=http://localhost:3000');
    }
  });

  it('ships provider-neutral network and secret contracts without credential values', async () => {
    for (const contract of ['network-policy.v1.json', 'runtime-secrets.v1.json']) {
      const content = await readFile(join(repositoryRoot, 'deploy/contracts', contract), 'utf8');
      expect(() => {
        JSON.parse(content);
      }).not.toThrow();
      expect(content).not.toMatch(/postgresql:\/\/[^\s"]+:[^\s"]+@/u);
      expect(content).not.toMatch(/BEGIN (?:RSA |EC )?PRIVATE KEY/u);
    }
  });
});
