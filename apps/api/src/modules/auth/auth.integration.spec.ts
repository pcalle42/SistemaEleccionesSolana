import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApplication } from '../../bootstrap.js';
import { getAppConfig } from '../../config/app-config.js';
import { createDatabase } from '../../database/client.js';
import { createDatabasePool } from '../../database/pool.js';
import type { ValkeyKeyFactory } from '../../valkey/key-factory.js';
import type { ValkeyService } from '../../valkey/valkey.service.js';
import { VALKEY_KEYS, VALKEY_SERVICE } from '../../valkey/valkey.tokens.js';
import { LocalAdminIdentityProvider } from './infrastructure/local-identity-provider/local-admin-identity-provider.js';
import { Argon2PasswordHasher } from './infrastructure/password-hasher/argon2-password-hasher.js';
import { securityDigest } from './infrastructure/security-digest.js';

const password = 'integration administrator password';
const migrationPool = createDatabasePool('migration');
let app: NestExpressApplication;

async function clearIntegrationRateLimits(): Promise<void> {
  const valkey = app.get<ValkeyService>(VALKEY_SERVICE);
  const keys = app.get<ValkeyKeyFactory>(VALKEY_KEYS);
  await Promise.all([
    valkey.delete(keys.adminLoginRateUser(securityDigest('admin-login-user', 'integration-admin'))),
    valkey.delete(
      keys.adminLoginRateNetwork(securityDigest('admin-login-network', '::ffff:127.0.0.1')),
    ),
    valkey.delete(keys.adminLoginRateNetwork(securityDigest('admin-login-network', '127.0.0.1'))),
  ]);
}

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
    throw new Error('Missing CSRF token');
  }
  return (value as Record<string, string>)['csrfToken']!;
}

function cookieFrom(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const cookie = header?.split(';')[0];
  if (!cookie) {
    throw new Error('Missing session cookie');
  }
  return cookie;
}

function tokenFrom(cookie: string): string {
  const token = cookie.split('=')[1];
  if (!token) {
    throw new Error('Invalid session cookie');
  }
  return token;
}

beforeAll(async () => {
  await migrationPool.query('DELETE FROM audit.admin_auth_event');
  await migrationPool.query('DELETE FROM admin.admin_account');

  const config = getAppConfig();
  const seedPool = createDatabasePool('runtime');
  try {
    const identity = new LocalAdminIdentityProvider(createDatabase(seedPool));
    const hasher = new Argon2PasswordHasher(config.auth.argon2);
    await identity.create('integration-admin', await hasher.hash(password));
  } finally {
    await seedPool.end();
  }

  app = await createApplication();
  await app.init();
  await clearIntegrationRateLimits();
});

afterAll(async () => {
  await clearIntegrationRateLimits();
  await app.close();
  await migrationPool.query('DELETE FROM audit.admin_auth_event');
  await migrationPool.query('DELETE FROM admin.admin_account');
  await migrationPool.end();
});

describe('administrative authentication integration', () => {
  it('persists, expires, revokes, and recreates real Valkey-backed sessions', async () => {
    const server = asSupertestServer(app.getHttpServer());
    const valkey = app.get<ValkeyService>(VALKEY_SERVICE);
    const keys = app.get<ValkeyKeyFactory>(VALKEY_KEYS);

    const login = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ password, username: 'integration-admin' })
      .expect(200);
    const cookie = cookieFrom(login.get('set-cookie'));
    const csrf = csrfToken(login.text);
    const sessionKey = keys.adminSession(securityDigest('admin-session', tokenFrom(cookie)));

    expect(await valkey.get(sessionKey)).not.toBeNull();
    expect(await valkey.ttl(sessionKey)).toBeGreaterThan(0);
    await request(server).get('/api/v1/admin/auth/session').set('Cookie', cookie).expect(200);

    await request(server)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrf)
      .expect(204);
    await request(server).get('/api/v1/admin/auth/session').set('Cookie', cookie).expect(401);

    const secondLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ password, username: 'integration-admin' })
      .expect(200);
    const secondCookie = cookieFrom(secondLogin.get('set-cookie'));
    const secondKey = keys.adminSession(securityDigest('admin-session', tokenFrom(secondCookie)));
    await valkey.delete(secondKey);
    await request(server).get('/api/v1/admin/auth/session').set('Cookie', secondCookie).expect(401);

    const recoveredLogin = await request(server)
      .post('/api/v1/admin/auth/login')
      .send({ password, username: 'integration-admin' })
      .expect(200);
    await request(server)
      .post('/api/v1/admin/auth/logout')
      .set('Cookie', cookieFrom(recoveredLogin.get('set-cookie')))
      .set('x-csrf-token', csrfToken(recoveredLogin.text))
      .expect(204);

    const events = await migrationPool.query<{ event: string }>(
      'SELECT event FROM audit.admin_auth_event ORDER BY occurred_at',
    );
    expect(events.rows.map((row) => row.event)).toEqual([
      'login_succeeded',
      'logout',
      'login_succeeded',
      'login_succeeded',
      'logout',
    ]);
  });
});
