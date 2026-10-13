import { appendFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { verifyElectionPackage } from '@votaciones/verification-protocol';

import {
  activeCredentialRows,
  artifactRoot,
  assert,
  createReadyElection,
  DevnetHttpError,
  jsonRequest,
  login,
  newRunId,
  proveVote,
  provisionVoters,
  runRoot,
  uniqueFixtureVoters,
} from './lib.mjs';

async function expectRejected(operation, acceptedCodes, description) {
  try {
    await operation();
  } catch (error) {
    if (error instanceof DevnetHttpError && acceptedCodes.includes(error.code)) return;
    throw error;
  }
  throw new Error(`${description} was unexpectedly accepted`);
}

const startedAt = new Date();
const runId = newRunId();
const session = await login();
const fixtureInputs = uniqueFixtureVoters(runId);
const voters = await provisionVoters(session, fixtureInputs);
let electionId;

try {
  const active = await activeCredentialRows();
  const activeCommitments = active.map((row) => row.identity_commitment);
  assert(
    activeCommitments.length >= voters.length,
    'Devnet has fewer active credentials than the E2E fixture',
  );
  const now = Date.now();
  const prepared = await createReadyElection(
    session,
    {
      closesAt: new Date(now + 60 * 60 * 1000).toISOString(),
      description: `Isolated devnet E2E run ${runId}`,
      opensAt: new Date(now - 60 * 1000).toISOString(),
      options: ['Synthetic A', 'Synthetic B', 'Synthetic blank'],
      title: `Devnet E2E ${runId}`,
    },
    activeCommitments,
  );
  electionId = prepared.election.id;
  const opened = await jsonRequest(
    `/admin/elections/${electionId}/open`,
    { method: 'POST' },
    session,
  );
  assert(opened.status === 'OPEN', 'E2E election did not open');

  const envelope = await jsonRequest(`/elections/${electionId}/manifest`);
  const firstPayload = await proveVote(voters[0], prepared.tree, envelope.manifest, 0);
  const first = await jsonRequest(`/elections/${electionId}/votes`, {
    body: firstPayload,
    method: 'POST',
  });
  const retry = await jsonRequest(`/elections/${electionId}/votes`, {
    body: firstPayload,
    method: 'POST',
  });
  assert(
    retry.receipt.receiptCommitment === first.receipt.receiptCommitment,
    'A duplicate retry did not return the same logical receipt',
  );

  const conflicting = await proveVote(voters[0], prepared.tree, envelope.manifest, 1);
  await expectRejected(
    () =>
      jsonRequest(`/elections/${electionId}/votes`, {
        body: conflicting,
        method: 'POST',
      }),
    ['NULLIFIER_ALREADY_USED'],
    'Conflicting duplicate vote',
  );

  const invalid = await proveVote(voters[1], prepared.tree, envelope.manifest, 2);
  invalid.proof.pi_a[0] = String(BigInt(invalid.proof.pi_a[0]) + 1n);
  await expectRejected(
    () =>
      jsonRequest(`/elections/${electionId}/votes`, {
        body: invalid,
        method: 'POST',
      }),
    ['PROOF_VERIFICATION_FAILED'],
    'Invalid proof',
  );

  const secondPayload = await proveVote(voters[2], prepared.tree, envelope.manifest, 1);
  const second = await jsonRequest(`/elections/${electionId}/votes`, {
    body: secondPayload,
    method: 'POST',
  });

  const closed = await jsonRequest(
    `/admin/elections/${electionId}/close`,
    { method: 'POST' },
    session,
  );
  assert(closed.status === 'CLOSED', 'E2E election did not close');
  const latePayload = await proveVote(voters[1], prepared.tree, envelope.manifest, 2);
  await expectRejected(
    () =>
      jsonRequest(`/elections/${electionId}/votes`, {
        body: latePayload,
        method: 'POST',
      }),
    ['ELECTION_NOT_OPEN'],
    'Late vote',
  );

  await jsonRequest(`/admin/elections/${electionId}/checkpoints`, { method: 'POST' }, session);
  const snapshot = await jsonRequest(
    `/admin/elections/${electionId}/enter-counting`,
    { method: 'POST' },
    session,
  );
  assert(snapshot.recordCount === 2, 'Frozen vote set does not contain exactly two votes');
  const tally = await jsonRequest(
    `/admin/elections/${electionId}/compute-tally`,
    { method: 'POST' },
    session,
  );
  assert(tally.acceptedVoteCount === 2, 'Tally accepted vote count differs from expected');
  assert(tally.totalsByOption[0].count === 1, 'Expected one vote for option 0');
  assert(tally.totalsByOption[1].count === 1, 'Expected one vote for option 1');

  const generated = await jsonRequest(
    `/admin/elections/${electionId}/verification-package`,
    { method: 'POST' },
    session,
  );
  assert(generated.report.valid === true, 'Generated verification package is invalid');
  const packagePath = join(artifactRoot, electionId, 'results', 'v1', generated.contentDigest);
  const offline = await verifyElectionPackage(packagePath);
  assert(offline.valid, 'Independent offline verification failed');

  const tamperPath = join('/tmp', `votaciones-devnet-tamper-${runId}`);
  await cp(packagePath, tamperPath, { recursive: true });
  try {
    await appendFile(join(tamperPath, 'tally.json'), '\n');
    const tampered = await verifyElectionPackage(tamperPath);
    assert(!tampered.valid, 'Tampered verification package was accepted');
  } finally {
    await rm(tamperPath, { force: true, recursive: true });
  }

  const result = await jsonRequest(
    `/admin/elections/${electionId}/publish-results`,
    { method: 'POST' },
    session,
  );
  assert(result.totalAcceptedVotes === 2, 'Published result vote count differs from expected');
  const publicResult = await jsonRequest(`/elections/${electionId}/results`);
  assert(
    publicResult.publicationDigest === result.publicationDigest,
    'Public result differs from the published result',
  );
  for (const vote of [first, second]) {
    const inclusion = await jsonRequest(
      `/elections/${electionId}/verification/receipts/${vote.receipt.receiptCommitment}`,
    );
    assert(
      inclusion.receiptCommitment === vote.receipt.receiptCommitment,
      'Accepted receipt is absent from published evidence',
    );
  }

  const runManifest = {
    artifactDigests: envelope.manifest.artifactDigests,
    circuitVersion: envelope.manifest.circuitVersion,
    containerImageIdentifiers: { api: 'local-devnet-build' },
    electionId,
    finishedAt: new Date().toISOString(),
    fixtureVersion: 'devnet-fixtures-v1',
    gitCommit: process.env.DEVNET_GIT_COMMIT ?? 'unknown',
    packageContentDigest: generated.contentDigest,
    packagePath,
    protocolVersion: envelope.manifest.protocolVersion,
    runId,
    startedAt: startedAt.toISOString(),
    verificationResult: 'verified',
  };
  await mkdir(runRoot, { recursive: true });
  await writeFile(join(runRoot, `${runId}.json`), `${JSON.stringify(runManifest, null, 2)}\n`, {
    mode: 0o640,
  });
  await writeFile(join(runRoot, 'latest.json'), `${JSON.stringify(runManifest, null, 2)}\n`, {
    mode: 0o640,
  });
  process.stdout.write(
    `Devnet E2E verified: election=${electionId} package=${generated.contentDigest}\n`,
  );
} finally {
  for (const voter of voters) {
    await jsonRequest(
      `/admin/electoral-credentials/${voter.credentialId}/revoke`,
      { method: 'POST' },
      session,
    ).catch(() => undefined);
  }
}

// snarkjs may retain worker handles after fullProve; this is a bounded CLI and
// all cleanup above has completed, so terminate deterministically on success.
process.exit(0);
