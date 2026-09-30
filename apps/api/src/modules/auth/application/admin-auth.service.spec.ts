import { describe, expect, it, vi } from 'vitest';

import { getAppConfig } from '../../../config/app-config.js';
import type { AdminSessionStore } from './ports/admin-session-store.port.js';
import type { AuthAudit } from './ports/auth-audit.port.js';
import type { IdentityProvider } from './ports/identity-provider.port.js';
import type { LoginRateLimiter } from './ports/login-rate-limiter.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';
import { AdminAuthService } from './admin-auth.service.js';

const config = getAppConfig({
  DATABASE_URL: 'postgresql://runtime:test@127.0.0.1:5432/test',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
});

function fixture(status: 'active' | 'inactive' = 'active') {
  const account = {
    id: 'admin-id',
    passwordHash: 'stored-hash',
    status,
    username: 'administrator',
  } as const;
  const findById = vi.fn().mockResolvedValue(account);
  const findByUsername = vi.fn().mockResolvedValue(account);
  const updatePassword = vi.fn();
  const identity = {
    findById,
    findByUsername,
    updatePassword,
  } as unknown as IdentityProvider;
  const sessionCreate = vi.fn().mockResolvedValue({
    csrfToken: 'csrf-token',
    principal: { adminId: 'admin-id', authSessionId: 'session-digest' },
    sessionToken: 'session-token',
  });
  const sessionRevoke = vi.fn().mockResolvedValue(undefined);
  const sessionRevokeAll = vi.fn().mockResolvedValue(undefined);
  const sessions = {
    create: sessionCreate,
    csrfToken: vi.fn(),
    resolve: vi.fn().mockResolvedValue({
      adminId: 'admin-id',
      authSessionId: 'session-digest',
    }),
    revoke: sessionRevoke,
    revokeAll: sessionRevokeAll,
    verifyCsrf: vi.fn(),
  } as unknown as AdminSessionStore;
  const passwordVerify = vi.fn((hash: string, password: string) =>
    Promise.resolve(hash === 'stored-hash' && password === 'correct-password'),
  );
  const passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    needsRehash: vi.fn().mockReturnValue(false),
    verify: passwordVerify,
  } as unknown as PasswordHasher;
  const rateConsume = vi.fn().mockResolvedValue({
    allowed: true,
    retryAfterSeconds: 300,
  });
  const rateLimiter = {
    consume: rateConsume,
  } as unknown as LoginRateLimiter;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuthAudit;
  return {
    audit,
    findById,
    findByUsername,
    identity,
    passwordVerify,
    passwords,
    rateConsume,
    rateLimiter,
    service: new AdminAuthService(identity, sessions, passwords, rateLimiter, audit, config),
    sessionCreate,
    sessionRevoke,
    sessionRevokeAll,
    sessions,
    updatePassword,
  };
}

const command = {
  networkSignal: '127.0.0.1',
  password: 'correct-password',
  requestId: 'request-12345678',
  username: 'administrator',
};

describe('AdminAuthService', () => {
  it('creates a fresh server-side session after valid credentials', async () => {
    const { service, sessionCreate } = fixture();
    await expect(service.login(command)).resolves.toEqual({
      adminId: 'admin-id',
      csrfToken: 'csrf-token',
      sessionToken: 'session-token',
    });
    expect(sessionCreate).toHaveBeenCalledWith('admin-id');
  });

  it('uses the same public error for an unknown user, wrong password, and inactive account', async () => {
    const unknown = fixture();
    unknown.findByUsername.mockResolvedValue(null);
    const wrong = fixture();
    const inactive = fixture('inactive');

    for (const candidate of [
      unknown.service.login(command),
      wrong.service.login({ ...command, password: 'wrong-password' }),
      inactive.service.login(command),
    ]) {
      await expect(candidate).rejects.toMatchObject({
        code: 'INVALID_ADMIN_CREDENTIALS',
        publicMessage: 'The supplied credentials are invalid.',
      });
    }
    expect(unknown.passwordVerify).toHaveBeenCalledOnce();
  });

  it('fails closed when rate-limit/session infrastructure is unavailable', async () => {
    const unavailable = fixture();
    unavailable.rateConsume.mockRejectedValue(new Error('private endpoint'));
    await expect(unavailable.service.login(command)).rejects.toMatchObject({
      code: 'ADMIN_SESSION_UNAVAILABLE',
      category: 'dependency-unavailable',
    });

    const limited = fixture();
    limited.rateConsume.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 300,
    });
    await expect(limited.service.login(command)).rejects.toMatchObject({
      code: 'ADMIN_LOGIN_RATE_LIMITED',
      category: 'rate-limit',
    });
  });

  it('rejects and revokes sessions when the persistent account is inactive', async () => {
    const inactive = fixture('inactive');
    await expect(inactive.service.authenticate('session-token')).rejects.toMatchObject({
      code: 'ADMIN_SESSION_INVALID',
    });
    expect(inactive.sessionRevoke).toHaveBeenCalledWith('session-token');
  });

  it('changes the password only after current-password verification and revokes sessions', async () => {
    const active = fixture();
    await active.service.changePassword(
      { adminId: 'admin-id', authSessionId: 'session-digest' },
      'correct-password',
      'new sufficiently long password',
      'request-12345678',
    );
    expect(active.updatePassword).toHaveBeenCalledWith('admin-id', 'new-hash');
    expect(active.sessionRevokeAll).toHaveBeenCalledTimes(2);
  });
});
