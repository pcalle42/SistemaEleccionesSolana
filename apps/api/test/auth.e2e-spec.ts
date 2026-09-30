import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { ELECTION_CLOCK, ELECTION_REPOSITORY } from '../src/modules/elections/elections.tokens.js';
import { ValkeyKeyFactory } from '../src/valkey/key-factory.js';
import { ValkeyLifecycleService } from '../src/valkey/valkey-lifecycle.service.js';
import { MemoryValkey } from './support/memory-valkey.js';
import { MemoryElectionRepository } from './support/memory-election-repository.js';

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
        circuitVersion: 'circuit-v1',
        eligibilityConfigurationRef: 'eligibility-v1',
        options: [
          { displayOrder: 0, label: 'Option A' },
          { displayOrder: 1, label: 'Option B' },
        ],
        protocolVersion: 'protocol-v1',
      })
      .expect(200);
    expect((configured.body as { options: unknown[] }).options).toHaveLength(2);

    const ready = await request(httpServer)
      .post(`/api/v1/admin/elections/${electionId}/ready`)
      .set(mutation())
      .expect(200);
    expect(ready.body).toMatchObject({ configurationVersion: 1, status: 'READY' });

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
