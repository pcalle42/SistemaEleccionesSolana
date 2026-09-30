import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { getAppConfig } from '../../../config/app-config.js';
import type { AdminAuthService } from '../application/admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import type { AdminRequest } from './auth-http.js';
import { CsrfGuard } from './csrf.guard.js';

const config = getAppConfig({
  DATABASE_URL: 'postgresql://runtime:test@127.0.0.1:5432/test',
  HTTP_CORS_ORIGINS: 'https://admin.example.test',
  VALKEY_HOST: '127.0.0.1',
  VOTACIONES_ENV: 'test',
});

function context(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('administrative authentication guards', () => {
  it('loads the minimum principal from the server-side session', async () => {
    const authenticate = vi.fn().mockResolvedValue({
      adminId: 'admin-id',
      authSessionId: 'session-digest',
    });
    const auth = {
      authenticate,
    } as unknown as AdminAuthService;
    const request = {
      headers: { cookie: 'votaciones_admin_session=session-token' },
    } as unknown as AdminRequest;

    await expect(new AdminAuthGuard(auth, config).canActivate(context(request))).resolves.toBe(
      true,
    );
    expect(request.adminPrincipal).toEqual({
      adminId: 'admin-id',
      authSessionId: 'session-digest',
    });
    expect(authenticate).toHaveBeenCalledWith('session-token');
  });

  it('requires a session-bound CSRF token and validates Origin when present', () => {
    const authorizeCsrf = vi.fn();
    const auth = { authorizeCsrf } as unknown as AdminAuthService;
    const guard = new CsrfGuard(auth, config);
    const request = {
      headers: {
        cookie: 'votaciones_admin_session=session-token',
        origin: 'https://admin.example.test',
        'x-csrf-token': 'csrf-token',
      },
    } as unknown as AdminRequest;

    expect(guard.canActivate(context(request))).toBe(true);
    expect(authorizeCsrf).toHaveBeenCalledWith('session-token', 'csrf-token');

    const rejected = {
      ...request,
      headers: { ...request.headers, origin: 'https://attacker.example.test' },
    };
    expect(() => guard.canActivate(context(rejected))).toThrow('request origin');
  });
});
