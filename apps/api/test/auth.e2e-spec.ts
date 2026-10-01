import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildMerkleTreeV1,
  CIRCUIT_ID_V1,
  CIRCUIT_VERSION_V1,
  COMMITMENT_SCHEME_VERSION_V1,
  deriveElectionContextV1,
  deriveIdentityCommitmentV1,
  deriveNullifierV1,
  NULLIFIER_SCHEME_VERSION_V1,
  PROTOCOL_VERSION_V1,
  protocolArtifactLocationsV1,
  TREE_DEPTH_V1,
  VOTE_ENCODING_VERSION_V1,
} from '@votaciones/zk-protocol';
import { groth16 } from 'snarkjs';

import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/bootstrap.js';
import { getAppConfig } from '../src/config/app-config.js';
import { APP_CONFIG } from '../src/config/config.tokens.js';
import { DatabaseLifecycleService } from '../src/database/database-lifecycle.service.js';
import type { AdminSessionStore } from '../src/modules/auth/application/ports/admin-session-store.port.js';
import type { AuthAudit } from '../src/modules/auth/application/ports/auth-audit.port.js';
import type { IdentityProvider } from '../src/modules/auth/application/ports/identity-provider.port.js';
import type { LoginRateLimiter } from '../src/modules/auth/application/ports/login-rate-limiter.port.js';
import type { PasswordHasher } from '../src/modules/auth/application/ports/password-hasher.port.js';
import {
  ADMIN_IDENTITY_PROVIDER,
  ADMIN_SESSION_STORE,
  AUTH_AUDIT,
  LOGIN_RATE_LIMITER,
  PASSWORD_HASHER,
} from '../src/modules/auth/auth.tokens.js';
import { ValkeyAdminSessionStore } from '../src/modules/auth/infrastructure/session-store/valkey-admin-session-store.js';
import type { Clock } from '../src/modules/elections/domain/clock.js';
import {
  ELECTION_CLOCK,
  ELECTION_READINESS,
  ELECTION_REPOSITORY,
} from '../src/modules/elections/elections.tokens.js';
import {
  ELECTORAL_CREDENTIAL_REPOSITORY,
  ELIGIBILITY_SNAPSHOT_REPOSITORY,
  ELIGIBLE_VOTER_REPOSITORY,
  MERKLE_TREE_BUILDER,
} from '../src/modules/eligibility/eligibility.tokens.js';
import { PoseidonMerkleTreeBuilder } from '../src/modules/eligibility/infrastructure/merkle/poseidon-merkle-tree-builder.js';
import type { VoteProofVerifier } from '../src/modules/zk/application/ports/vote-proof-verifier.port.js';
import { VOTE_PROOF_VERIFIER } from '../src/modules/zk/zk.tokens.js';
import { ValkeyKeyFactory } from '../src/valkey/key-factory.js';
import { ValkeyLifecycleService } from '../src/valkey/valkey-lifecycle.service.js';
import { MemoryValkey } from './support/memory-valkey.js';
import { MemoryElectionRepository } from './support/memory-election-repository.js';
import {
  MemoryElectionReadinessVerifier,
  MemoryElectoralCredentialRepository,
  MemoryEligibilitySnapshotRepository,
  MemoryEligibleVoterRepository,
} from './support/memory-eligibility.js';

const config = getAppConfig({
  DATABASE_URL: 'postgresql://runtime:not-logged@127.0.0.1:5432/test',
  HTTP_CORS_ORIGINS: 'http://localhost:3001',
  LOG_LEVEL: 'silent',
  OPENAPI_ENABLED: 'false',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
});
const memoryValkey = new MemoryValkey();
const sessions = new ValkeyAdminSessionStore(
  memoryValkey.asService(),
  new ValkeyKeyFactory('test'),
  config.auth,
);
const identity = {
  findById: vi.fn().mockResolvedValue({
    id: '12e3e67b-e29b-41d4-a716-446655440000',
    passwordHash: 'valid-password-hash',
    status: 'active',
    username: 'administrator',
  }),
  findByUsername: vi.fn().mockImplementation((username: string) =>
    Promise.resolve(
      username === 'administrator'
        ? {
            id: '12e3e67b-e29b-41d4-a716-446655440000',
            passwordHash: 'valid-password-hash',
            status: 'active',
            username,
          }
        : null,
    ),
  ),
  updatePassword: vi.fn(),
} as unknown as IdentityProvider;
const verifyPassword = vi.fn((hash: string, password: string) =>
  Promise.resolve(hash === 'valid-password-hash' && password === 'correct-password-value'),
);
const passwords = {
  hash: vi.fn().mockResolvedValue('updated-password-hash'),
  needsRehash: vi.fn().mockReturnValue(false),
  verify: verifyPassword,
} as unknown as PasswordHasher;
const limiterState = { limited: false };
const rateLimiter = {
  consume: vi.fn().mockImplementation(() =>
    Promise.resolve({
      allowed: !limiterState.limited,
      retryAfterSeconds: 300,
    }),
  ),
} as unknown as LoginRateLimiter;
const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuthAudit;
const electionRepository = new MemoryElectionRepository();
const electionClock: Clock = { now: () => new Date('2030-01-01T12:00:00.000Z') };
const voterRepository = new MemoryEligibleVoterRepository();
const credentialRepository = new MemoryElectoralCredentialRepository();
const snapshotRepository = new MemoryEligibilitySnapshotRepository(electionRepository);
const merkleBuilder = new PoseidonMerkleTreeBuilder();
const electionReadiness = new MemoryElectionReadinessVerifier(snapshotRepository);
const databaseLifecycle = {
  health: vi.fn(),
  onApplicationShutdown: vi.fn(),
};
const valkeyLifecycle = {
  health: vi.fn().mockResolvedValue('healthy'),
  onApplicationShutdown: vi.fn(),
  onModuleInit: vi.fn(),
};

function asSupertestServer(value: unknown): Parameters<typeof request>[0] {
  return value as Parameters<typeof request>[0];
}

function csrfToken(responseText: string): string {
  const value = JSON.parse(responseText) as unknown;
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as Record<string, unknown>)['csrfToken'] !== 'string'
  ) {
    throw new Error('Response does not contain a CSRF token');
  }
  return (value as Record<string, string>)['csrfToken']!;
}

function cookieFrom(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const cookie = header?.split(';')[0];
  if (!cookie) {
    throw new Error('Response does not contain a session cookie');
  }
  return cookie;
}

function serializedSetCookie(setCookie: string | string[] | undefined): string {
  return Array.isArray(setCookie) ? setCookie.join('; ') : (setCookie ?? '');
}

describe('administrative authentication HTTP flow', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(ADMIN_IDENTITY_PROVIDER)
      .useValue(identity)
      .overrideProvider(ADMIN_SESSION_STORE)
      .useValue(sessions as AdminSessionStore)
      .overrideProvider(PASSWORD_HASHER)
      .useValue(passwords)
      .overrideProvider(LOGIN_RATE_LIMITER)
      .useValue(rateLimiter)
      .overrideProvider(AUTH_AUDIT)
      .useValue(audit)
      .overrideProvider(ELECTION_REPOSITORY)
      .useValue(electionRepository)
      .overrideProvider(ELECTION_CLOCK)
      .useValue(electionClock)
      .overrideProvider(ELECTION_READINESS)
      .useValue(electionReadiness)
      .overrideProvider(ELIGIBLE_VOTER_REPOSITORY)
      .useValue(voterRepository)
      .overrideProvider(ELECTORAL_CREDENTIAL_REPOSITORY)
      .useValue(credentialRepository)
      .overrideProvider(ELIGIBILITY_SNAPSHOT_REPOSITORY)
      .useValue(snapshotRepository)
      .overrideProvider(MERKLE_TREE_BUILDER)
      .useValue(merkleBuilder)
      .overrideProvider(DatabaseLifecycleService)
      .useValue(databaseLifecycle)
      .overrideProvider(ValkeyLifecycleService)
      .useValue(valkeyLifecycle)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useLogger(app.get(Logger));
    configureApplication(app as NestExpressApplication, config);
    await app.init();
    httpServer = asSupertestServer(app.getHttpServer());
  });

  afterAll(async () => app.close());

  it('rejects protected access without a session', async () => {
    const response = await request(httpServer).get('/api/v1/admin/auth/session').expect(401);
    expect(response.body).toMatchObject({ error: { code: 'ADMIN_SESSION_REQUIRED' } });
  });

  it('returns the same generic response for invalid credentials', async () => {
    const wrongUser = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'wrong-password-value', username: 'unknown-user' })
      .expect(401);
    const wrongPassword = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'wrong-password-value', username: 'administrator' })
      .expect(401);
    expect(wrongUser.body).toMatchObject({ error: { code: 'INVALID_ADMIN_CREDENTIALS' } });
    expect(wrongPassword.body).toMatchObject({ error: { code: 'INVALID_ADMIN_CREDENTIALS' } });
  });

  it('prevents fixation, authenticates, enforces CSRF, and revokes immediately', async () => {
    const fixed = `votaciones_admin_session=${'F'.repeat(43)}`;
    const login = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .set('Cookie', fixed)
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(200);
    const cookie = cookieFrom(login.get('set-cookie'));
    const cookieAttributes = serializedSetCookie(login.get('set-cookie'));
    const csrf = csrfToken(login.text);

    expect(cookie).not.toBe(fixed);
    expect(cookieAttributes).toContain('HttpOnly');
    expect(cookieAttributes).toContain('SameSite=Strict');
    expect(cookieAttributes).toContain('Path=/');
    expect(login.text).not.toContain(cookie.split('=')[1]!);
    expect(login.get('cache-control')).toBe('no-store');
    await request(httpServer).get('/api/v1/admin/auth/session').set('Cookie', cookie).expect(200);
    await request(httpServer).post('/api/v1/admin/auth/logout').set('Cookie', cookie).expect(403);

    const otherLogin = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(200);
    const otherCsrf = csrfToken(otherLogin.text);
    await request(httpServer)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie)
      .set('x-csrf-token', otherCsrf)
      .expect(403);

    await request(httpServer)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(204);
    await request(httpServer).get('/api/v1/admin/auth/session').set('Cookie', cookie).expect(401);
    await request(httpServer).post('/api/v1/admin/auth/logout').set('Cookie', cookie).expect(204);
  });

  it('allows the CSRF header only for configured CORS origins', async () => {
    const response = await request(httpServer)
      .options('/api/v1/admin/auth/logout')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-csrf-token')
      .expect(204);
    expect(response.get('access-control-allow-origin')).toBe('http://localhost:3001');
    expect(response.get('access-control-allow-headers')).toContain('x-csrf-token');
  });

  it('fails closed when Valkey is down and rate limits before password hashing', async () => {
    const login = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(200);
    const cookie = cookieFrom(login.get('set-cookie'));

    memoryValkey.fail = true;
    await request(httpServer).get('/api/v1/admin/auth/session').set('Cookie', cookie).expect(503);
    await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(503);
    memoryValkey.fail = false;

    const priorVerifications = verifyPassword.mock.calls.length;
    limiterState.limited = true;
    const limited = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(429);
    limiterState.limited = false;
    expect(limited.body).toMatchObject({ error: { code: 'ADMIN_LOGIN_RATE_LIMITED' } });
    expect(verifyPassword.mock.calls).toHaveLength(priorVerifications);
  });

  it('enforces the administrative election lifecycle and frozen configuration', async () => {
    const firstSecret = '111111111111111111111111111111111111111';
    const secondSecret = '222222222222222222222222222222222222222';
    const thirdSecret = '333333333333333333333333333333333333333';
    const firstCommitment = await deriveIdentityCommitmentV1(firstSecret);
    const secondCommitment = await deriveIdentityCommitmentV1(secondSecret);
    const thirdCommitment = await deriveIdentityCommitmentV1(thirdSecret);
    const login = await request(httpServer)
      .post('/api/v1/admin/auth/login')
      .send({ password: 'correct-password-value', username: 'administrator' })
      .expect(200);
    const cookie = cookieFrom(login.get('set-cookie'));
    const csrf = csrfToken(login.text);
    const mutation = () => ({ Cookie: cookie, 'x-csrf-token': csrf });

    const created = await request(httpServer)
      .post('/api/v1/admin/elections')
      .set(mutation())
      .send({
        closesAt: '2030-01-01T13:00:00.000Z',
        opensAt: '2030-01-01T11:00:00.000Z',
        title: 'E2E election',
      })
      .expect(201);
    const electionId = (created.body as { id: string }).id;
    expect(created.body).toMatchObject({ status: 'DRAFT', votingMethod: 'SINGLE_CHOICE' });

    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/ready`)
      .set(mutation())
      .expect(409);

    const configured = await request(httpServer)
      .patch(`/api/v1/admin/elections/${electionId}`)
      .set(mutation())
      .send({
        circuitVersion: CIRCUIT_VERSION_V1,
        options: [
          { displayOrder: 0, label: 'Option A' },
          { displayOrder: 1, label: 'Option B' },
        ],
        protocolVersion: PROTOCOL_VERSION_V1,
      })
      .expect(200);
    expect((configured.body as { options: unknown[] }).options).toHaveLength(2);

    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/ready`)
      .set(mutation())
      .expect(409);

    const rejectedSecret = await request(httpServer)
      .post('/api/v1/admin/eligible-voters')
      .set(mutation())
      .send({ externalReference: 'PADRON-SECRET', voterSecret: 'must-never-be-accepted' })
      .expect(400);
    expect(rejectedSecret.text).not.toContain('must-never-be-accepted');

    const firstVoter = await request(httpServer)
      .post('/api/v1/admin/eligible-voters')
      .set(mutation())
      .send({ displayName: 'Voter A', externalReference: 'PADRON-001' })
      .expect(201);
    const secondVoter = await request(httpServer)
      .post('/api/v1/admin/eligible-voters')
      .set(mutation())
      .send({ displayName: 'Voter B', externalReference: 'PADRON-002' })
      .expect(201);
    const firstVoterId = (firstVoter.body as { id: string }).id;
    const secondVoterId = (secondVoter.body as { id: string }).id;

    await request(httpServer)
      .post('/api/v1/admin/eligible-voters/import')
      .set(mutation())
      .send({
        dryRun: true,
        records: [{ externalReference: 'PADRON-DRY-001' }, { externalReference: 'PADRON-DRY-002' }],
      })
      .expect(200, { created: 0, updated: 0, validated: 2 });
    await request(httpServer)
      .post('/api/v1/admin/eligible-voters/import')
      .set(mutation())
      .send({
        records: [
          { externalReference: ' PADRON-DUPLICATE ' },
          { externalReference: 'PADRON-DUPLICATE' },
        ],
      })
      .expect(400);

    await request(httpServer)
      .post('/api/v1/admin/electoral-credentials')
      .set(mutation())
      .send({
        eligibleVoterId: firstVoterId,
        identityCommitment: firstCommitment,
        schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      })
      .expect(201);
    await request(httpServer)
      .post('/api/v1/admin/electoral-credentials')
      .set(mutation())
      .send({
        eligibleVoterId: secondVoterId,
        identityCommitment: firstCommitment,
        schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      })
      .expect(409);
    await request(httpServer)
      .post('/api/v1/admin/electoral-credentials')
      .set(mutation())
      .send({
        eligibleVoterId: secondVoterId,
        identityCommitment: secondCommitment,
        schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      })
      .expect(201);

    const built = await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/eligibility-snapshots`)
      .set(mutation())
      .expect(201);
    const snapshotId = (built.body as { id: string }).id;
    expect(built.body).toMatchObject({ leafCount: 2, status: 'BUILDING', version: 1 });
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/eligibility-snapshots/${snapshotId}/freeze`)
      .set(mutation())
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'FROZEN' }));

    const ready = await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/ready`)
      .set(mutation())
      .expect(200);
    expect(ready.body).toMatchObject({ configurationVersion: 1, status: 'READY' });

    const tree = await buildMerkleTreeV1([firstCommitment, secondCommitment]);
    expect((built.body as { merkleRoot: string }).merkleRoot).toBe(tree.root);
    const options = (configured.body as { options: { id: string }[] }).options;
    const electionContext = deriveElectionContextV1({
      circuitId: CIRCUIT_ID_V1,
      circuitVersion: CIRCUIT_VERSION_V1,
      commitmentSchemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      configurationVersion: 1,
      electionId,
      nullifierSchemeVersion: NULLIFIER_SCHEME_VERSION_V1,
      options: options.map((option, index) => ({ id: option.id, index })),
      protocolVersion: PROTOCOL_VERSION_V1,
      treeDepth: TREE_DEPTH_V1,
      voteEncodingVersion: VOTE_ENCODING_VERSION_V1,
    });
    const membership = tree.proof(tree.leaves.indexOf(firstCommitment));
    const artifacts = protocolArtifactLocationsV1();
    const proofResult = await groth16.fullProve(
      {
        electionContext,
        merklePathElements: [...membership.pathElements],
        merklePathIndices: [...membership.pathIndices],
        merkleRoot: tree.root,
        nullifier: await deriveNullifierV1(firstSecret, electionContext),
        optionCount: options.length,
        voteChoice: 0,
        voterSecret: firstSecret,
      },
      artifacts.wasm.pathname,
      artifacts.zkey.pathname,
    );
    const proofVerifier = app.get<VoteProofVerifier>(VOTE_PROOF_VERIFIER);
    await expect(
      proofVerifier.verify(
        {
          proof: proofResult.proof,
          protocolVersion: PROTOCOL_VERSION_V1,
          publicSignals: proofResult.publicSignals,
        },
        {
          circuitVersion: CIRCUIT_VERSION_V1,
          electionContext,
          merkleRoot: tree.root,
          optionCount: options.length,
        },
      ),
    ).resolves.toMatchObject({ publicSignals: { voteChoice: 0 } });

    await request(httpServer)
      .patch(`/api/v1/admin/elections/${electionId}`)
      .set(mutation())
      .send({ title: 'Forbidden edit' })
      .expect(409);
    await request(httpServer)
      .patch(`/api/v1/admin/elections/${electionId}`)
      .set(mutation())
      .send({ status: 'OPEN' })
      .expect(400);

    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/eligibility-snapshots/${snapshotId}/freeze`)
      .set(mutation())
      .expect(409);
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/reopen-draft`)
      .set(mutation())
      .send({ reason: 'Eligibility set changed before opening' })
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'DRAFT' }));

    const thirdVoter = await request(httpServer)
      .post('/api/v1/admin/eligible-voters')
      .set(mutation())
      .send({ externalReference: 'PADRON-003' })
      .expect(201);
    await request(httpServer)
      .post('/api/v1/admin/electoral-credentials')
      .set(mutation())
      .send({
        eligibleVoterId: (thirdVoter.body as { id: string }).id,
        identityCommitment: thirdCommitment,
        schemeVersion: COMMITMENT_SCHEME_VERSION_V1,
      })
      .expect(201);
    const rebuilt = await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/eligibility-snapshots`)
      .set(mutation())
      .expect(201);
    const rebuiltId = (rebuilt.body as { id: string }).id;
    expect(rebuilt.body).toMatchObject({ configurationVersion: 2, leafCount: 3 });
    expect((rebuilt.body as { merkleRoot: string }).merkleRoot).not.toBe(
      (built.body as { merkleRoot: string }).merkleRoot,
    );
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/eligibility-snapshots/${rebuiltId}/freeze`)
      .set(mutation())
      .expect(200);
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/ready`)
      .set(mutation())
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ configurationVersion: 2, status: 'READY' }),
      );

    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/open`)
      .set(mutation())
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'OPEN' }));
    await request(httpServer)
      .patch(`/api/v1/admin/elections/${electionId}`)
      .set(mutation())
      .send({ options: [{ displayOrder: 0, label: 'Changed' }] })
      .expect(409);
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/close`)
      .set(mutation())
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'CLOSED' }));
    await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/reopen-draft`)
      .set(mutation())
      .send({ reason: 'Cannot reopen closed election' })
      .expect(409);
  });
});
