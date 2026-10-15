import { resolve } from 'node:path';

import { invariant, readJson, repositoryRoot, validateSchema } from '../release/lib.mjs';

const gates = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

export async function verifyProductionProfile(profile, options = {}) {
  await validateSchema(profile, 'deploy/schemas/production-profile-v1.schema.json');
  invariant(
    options.allowSynthetic === true || profile.synthetic === false,
    'Synthetic profile cannot authorize production.',
  );
  invariant(
    profile.providerDecision.status === 'approved' && profile.providerDecision.adr,
    'Provider ADR is not approved.',
  );
  for (const name of ['adminOrigin', 'voterOrigin', 'apiOrigin']) {
    invariant(new URL(profile.topology[name]).protocol === 'https:', `${name} must use HTTPS.`);
  }
  invariant(
    profile.topology.httpsOnly && profile.topology.httpRedirect,
    'TLS enforcement is incomplete.',
  );
  invariant(
    profile.topology.ingressPorts.every((port) => port === 443),
    'Only ingress port 443 is allowed.',
  );
  invariant(
    profile.topology.certificateLifecycleEvidence,
    'Certificate lifecycle evidence is missing.',
  );

  const postgres = profile.data.postgresql;
  invariant(
    postgres.private && postgres.authoritative,
    'PostgreSQL must be private and authoritative.',
  );
  invariant(
    !postgres.runtimeDdl && postgres.migrationIdentitySeparate,
    'Database roles are not separated.',
  );
  invariant(
    postgres.encryptionAtRest && postgres.backupScheduled && postgres.restoreTested,
    'Database durability evidence is incomplete.',
  );
  invariant(
    postgres.rpoMinutes !== null && postgres.rtoMinutes !== null,
    'RPO/RTO are not approved.',
  );
  const valkey = profile.data.valkey;
  invariant(
    valkey.private && valkey.authenticated && !valkey.authoritative && valkey.lossTested,
    'Valkey profile is unsafe.',
  );

  for (const [control, value] of Object.entries(profile.artifacts)) {
    invariant(value, `Artifact control is incomplete: ${control}.`);
  }
  for (const [control, value] of Object.entries(profile.secrets)) {
    invariant(value, `Secret control is incomplete: ${control}.`);
  }
  for (const [control, value] of Object.entries(profile.iam)) {
    invariant(value === true, `IAM control is incomplete: ${control}.`);
  }
  for (const image of Object.values(profile.deployment.images)) {
    invariant(!image.includes(':latest'), 'latest image tags are forbidden.');
  }
  invariant(
    profile.deployment.migrationJob && profile.deployment.migrationIdentitySeparate,
    'Migration job boundary is incomplete.',
  );
  invariant(
    profile.deployment.readinessGate && !profile.deployment.startupMigrations,
    'Deployment traffic gate is unsafe.',
  );
  invariant(profile.deployment.rollbackPlan, 'Rollback/forward-fix evidence is missing.');
  for (const [control, value] of Object.entries(profile.operations)) {
    invariant(value, `Operational control is incomplete: ${control}.`);
  }
  invariant(profile.capacity.status === 'approved', 'Capacity is not approved.');
  invariant(profile.capacity.baselineEvidence, 'Capacity baseline evidence is missing.');
  invariant(profile.capacity.peakVotesPerSecond > 0, 'Peak voting capacity is not defined.');
  invariant(profile.capacity.headroomPercent >= 0, 'Capacity headroom is not defined.');
  for (const gate of gates) {
    invariant(profile.gates[gate].status === 'approved', `${gate} is not approved.`);
    invariant(profile.gates[gate].evidence.length > 0, `${gate} has no evidence.`);
  }
  return {
    profileId: profile.profileId,
    releaseManifestDigest: profile.releaseManifestDigest,
    verified: true,
  };
}

export async function readAndVerifyProductionProfile(path, options) {
  const profile = await readJson(resolve(path));
  return { profile, result: await verifyProductionProfile(profile, options) };
}

export const productionProfileTemplate = resolve(
  repositoryRoot,
  'deploy/production-profile.template.json',
);
