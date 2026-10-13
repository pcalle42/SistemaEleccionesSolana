import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildMerkleTreeV1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  PROTOCOL_VERSION_V1,
  protocolArtifactLocationsV1,
} from '@votaciones/zk-protocol';
import pg from 'pg';
import { groth16 } from 'snarkjs';

export const apiBase = process.env.DEVNET_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';
export const browserOrigin = process.env.DEVNET_ADMIN_ORIGIN ?? 'http://localhost:3101';
export const artifactRoot = resolve(
  process.env.VERIFICATION_ARTIFACT_DIRECTORY ?? '/app/.artifacts/verification-packages',
);
export const runRoot = resolve(process.env.DEVNET_RUN_DIRECTORY ?? '/app/.artifacts/devnet-runs');

export class DevnetHttpError extends Error {
  constructor(status, code, message) {
    super(`${status} ${code}: ${message}`);
    this.name = 'DevnetHttpError';
    this.status = status;
    this.code = code;
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function jsonRequest(path, init = {}, session) {
  const headers = new Headers({ Accept: 'application/json' });
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (session) {
    headers.set('Cookie', session.cookie);
    headers.set('Origin', browserOrigin);
    if (!['GET', 'HEAD'].includes(init.method ?? 'GET')) {
      headers.set('x-csrf-token', session.csrfToken);
    }
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  if (response.ok) {
    return response.status === 204 ? undefined : response.json();
  }
  const body = await response.json().catch(() => ({}));
  throw new DevnetHttpError(
    response.status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? 'Devnet request failed',
  );
}

export async function login() {
  const username = process.env.DEVNET_ADMIN_USERNAME;
  const password = process.env.DEVNET_ADMIN_PASSWORD;
  assert(username && password, 'DEVNET_ADMIN_USERNAME and DEVNET_ADMIN_PASSWORD are required');
  const response = await fetch(`${apiBase}/admin/auth/login`, {
    body: JSON.stringify({ password, username }),
    headers: { 'Content-Type': 'application/json', Origin: browserOrigin },
    method: 'POST',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new DevnetHttpError(
      response.status,
      body?.error?.code ?? 'LOGIN_FAILED',
      body?.error?.message ?? 'Devnet admin login failed',
    );
  }
  const setCookie = response.headers.get('set-cookie');
  assert(setCookie, 'Admin login did not return a session cookie');
  return { cookie: setCookie.split(';', 1)[0], csrfToken: body.csrfToken };
}

export async function loadFixture() {
  return JSON.parse(await readFile(resolve('fixtures/devnet/manifest.json'), 'utf8'));
}

export async function fixtureCommitments(fixture) {
  return Promise.all(fixture.voters.map((voter) => deriveIdentityCommitmentV1(voter.voterSecret)));
}

export async function activeCredentialRows(prefix) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `SELECT credential.id, credential.identity_commitment, voter.external_reference
         FROM eligibility.electoral_credentials credential
         JOIN eligibility.eligible_voters voter ON voter.id = credential.eligible_voter_id
        WHERE credential.status = 'ACTIVE' AND voter.status = 'ACTIVE'
          AND ($1::text IS NULL OR voter.external_reference LIKE $1 || '%')
        ORDER BY credential.identity_commitment`,
      [prefix ?? null],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

export async function provisionVoters(session, voters) {
  await jsonRequest(
    '/admin/eligible-voters/import',
    {
      body: {
        dryRun: false,
        records: voters.map((voter) => ({
          displayName: `Synthetic ${voter.externalReference}`,
          externalReference: voter.externalReference,
        })),
      },
      method: 'POST',
    },
    session,
  );
  const listed = await jsonRequest('/admin/eligible-voters', {}, session);
  const byReference = new Map(listed.map((voter) => [voter.externalReference, voter]));
  const existing = new Map(
    (await activeCredentialRows()).map((row) => [row.external_reference, row]),
  );
  const provisioned = [];
  for (const voter of voters) {
    const record = byReference.get(voter.externalReference);
    assert(record, `Fixture voter is missing: ${voter.externalReference}`);
    const identityCommitment = await deriveIdentityCommitmentV1(voter.voterSecret);
    let credential = existing.get(voter.externalReference);
    if (!credential) {
      credential = await jsonRequest(
        '/admin/electoral-credentials',
        {
          body: {
            eligibleVoterId: record.id,
            identityCommitment,
            schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
          },
          method: 'POST',
        },
        session,
      );
    }
    assert(
      credential.identity_commitment === undefined ||
        credential.identity_commitment === identityCommitment,
      `Credential mismatch for ${voter.externalReference}`,
    );
    provisioned.push({
      credentialId: credential.id,
      externalReference: voter.externalReference,
      identityCommitment,
      voterSecret: voter.voterSecret,
    });
  }
  return provisioned;
}

export async function createReadyElection(session, input, expectedCommitments) {
  const election = await jsonRequest(
    '/admin/elections',
    {
      body: {
        circuitVersion: CIRCUIT_VERSION_V1,
        closesAt: input.closesAt,
        description: input.description,
        opensAt: input.opensAt,
        options: input.options.map((label, displayOrder) => ({ displayOrder, label })),
        protocolVersion: PROTOCOL_VERSION_V1,
        title: input.title,
        votingMethod: 'SINGLE_CHOICE',
      },
      method: 'POST',
    },
    session,
  );
  const snapshot = await jsonRequest(
    `/admin/elections/${election.id}/eligibility-snapshots`,
    { method: 'POST' },
    session,
  );
  const tree = await buildMerkleTreeV1(expectedCommitments);
  assert(
    snapshot.merkleRoot === tree.root,
    'Eligibility root differs from independent fixture tree',
  );
  assert(snapshot.leafCount === tree.leaves.length, 'Eligibility leaf count is not deterministic');
  await jsonRequest(
    `/admin/elections/${election.id}/eligibility-snapshots/${snapshot.id}/freeze`,
    { method: 'POST' },
    session,
  );
  const ready = await jsonRequest(
    `/admin/elections/${election.id}/ready`,
    { method: 'POST' },
    session,
  );
  assert(ready.status === 'READY', 'Election did not reach READY');
  return { election: ready, tree };
}

export async function proveVote(voter, tree, manifest, voteChoice) {
  const leafIndex = tree.leaves.indexOf(voter.identityCommitment);
  assert(leafIndex >= 0, 'Voter commitment is absent from the eligibility tree');
  const membership = tree.proof(leafIndex);
  const nullifier = await deriveNullifierV1(voter.voterSecret, manifest.electionContext);
  const locations = protocolArtifactLocationsV1();
  const generated = await groth16.fullProve(
    {
      electionContext: manifest.electionContext,
      merklePathElements: [...membership.pathElements],
      merklePathIndices: [...membership.pathIndices],
      merkleRoot: manifest.merkleRoot,
      nullifier,
      optionCount: manifest.options.length,
      voteChoice,
      voterSecret: voter.voterSecret,
    },
    locations.wasm.pathname,
    locations.zkey.pathname,
  );
  return {
    proof: generated.proof,
    protocolVersion: PROTOCOL_VERSION_V1,
    publicSignals: generated.publicSignals.map(String),
  };
}

export function uniqueFixtureVoters(runId, count = 3) {
  return Array.from({ length: count }, (_, index) => {
    const digest = createHash('sha256').update(`${runId}:${index}`).digest('hex');
    const scalar = (BigInt(`0x${digest}`) % BigInt(2) ** BigInt(250)) + BigInt(1);
    return {
      externalReference: `DEV-E2E-${runId.slice(0, 8)}-${index + 1}`,
      voterSecret: scalar.toString(),
    };
  });
}

export const newRunId = () => randomUUID();
