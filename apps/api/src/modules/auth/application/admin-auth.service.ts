import { Inject, Injectable } from '@nestjs/common';

import {
  ApplicationError,
  DependencyUnavailableError,
} from '../../../common/errors/application-error.js';
import type { AppConfig } from '../../../config/app-config.js';
import { APP_CONFIG } from '../../../config/config.tokens.js';
import {
  ADMIN_IDENTITY_PROVIDER,
  ADMIN_SESSION_STORE,
  AUTH_AUDIT,
  LOGIN_RATE_LIMITER,
  PASSWORD_HASHER,
} from '../auth.tokens.js';
import { normalizeAdminUsername } from '../domain/admin-account.js';
import type { AdminAccount } from '../domain/admin-account.js';
import type { AdminPrincipal } from '../domain/admin-principal.js';
import { validateAdminPassword } from '../domain/password-policy.js';
import type { AdminSessionStore } from './ports/admin-session-store.port.js';
import type { AuthAudit } from './ports/auth-audit.port.js';
import type { IdentityProvider } from './ports/identity-provider.port.js';
import type { LoginRateLimiter } from './ports/login-rate-limiter.port.js';
import type { PasswordHasher } from './ports/password-hasher.port.js';

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$SNg1a4lEFRlKIPRs7P3UwA$5I63YmC/YS/CfsbYgfoXsxVEUbXcyVpmcnzbm9yrSRA';

export interface AdminLoginCommand {
  readonly networkSignal: string;
  readonly password: string;
  readonly requestId?: string;
  readonly username: string;
}

export interface AdminLoginResult {
  readonly adminId: string;
  readonly csrfToken: string;
  readonly sessionToken: string;
}

function invalidCredentials(): ApplicationError {
  return new ApplicationError(
    'INVALID_ADMIN_CREDENTIALS',
    'The supplied credentials are invalid.',
    'authentication',
  );
}

function sessionUnavailable(cause: unknown): DependencyUnavailableError {
  return new DependencyUnavailableError(
    'ADMIN_SESSION_UNAVAILABLE',
    'Administrative authentication is temporarily unavailable.',
    { cause },
  );
}

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(ADMIN_IDENTITY_PROVIDER) private readonly identity: IdentityProvider,
    @Inject(ADMIN_SESSION_STORE) private readonly sessions: AdminSessionStore,
    @Inject(PASSWORD_HASHER) private readonly passwords: PasswordHasher,
    @Inject(LOGIN_RATE_LIMITER) private readonly rateLimiter: LoginRateLimiter,
    @Inject(AUTH_AUDIT) private readonly audit: AuthAudit,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async authenticate(sessionToken: string | null): Promise<AdminPrincipal> {
    if (!sessionToken) {
      throw new ApplicationError(
        'ADMIN_SESSION_REQUIRED',
        'Authentication is required.',
        'authentication',
      );
    }
    let principal: AdminPrincipal | null;
    try {
      principal = await this.sessions.resolve(sessionToken);
    } catch (error: unknown) {
      throw sessionUnavailable(error);
    }
    if (!principal) {
      throw new ApplicationError(
        'ADMIN_SESSION_INVALID',
        'Authentication is required.',
        'authentication',
      );
    }
    let account: AdminAccount | null;
    try {
      account = await this.identity.findById(principal.adminId);
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'ADMIN_IDENTITY_UNAVAILABLE',
        'Administrative authentication is temporarily unavailable.',
        { cause: error },
      );
    }
    if (!account || account.status !== 'active') {
      await this.sessions.revoke(sessionToken).catch(() => undefined);
      throw new ApplicationError(
        'ADMIN_SESSION_INVALID',
        'Authentication is required.',
        'authentication',
      );
    }
    return principal;
  }

  authorizeCsrf(sessionToken: string | null, csrfToken: string | null): void {
    if (!sessionToken || !csrfToken || !this.sessions.verifyCsrf(sessionToken, csrfToken)) {
      throw new ApplicationError(
        'CSRF_TOKEN_INVALID',
        'The CSRF token is invalid.',
        'authorization',
      );
    }
  }

  csrfToken(sessionToken: string): string {
    return this.sessions.csrfToken(sessionToken);
  }

  async login(command: AdminLoginCommand): Promise<AdminLoginResult> {
    const username = normalizeAdminUsername(command.username);
    let rateLimit;
    try {
      rateLimit = await this.rateLimiter.consume(
        username ?? command.username.normalize('NFKC').trim().toLowerCase(),
        command.networkSignal,
      );
    } catch (error: unknown) {
      throw sessionUnavailable(error);
    }
    if (!rateLimit.allowed) {
      await this.recordAudit({
        event: 'rate_limited',
        outcome: 'limited',
        requestId: command.requestId,
      });
      throw new ApplicationError(
        'ADMIN_LOGIN_RATE_LIMITED',
        'Too many authentication attempts.',
        'rate-limit',
      );
    }

    let account: AdminAccount | null;
    try {
      account = username ? await this.identity.findByUsername(username) : null;
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'ADMIN_IDENTITY_UNAVAILABLE',
        'Administrative authentication is temporarily unavailable.',
        { cause: error },
      );
    }
    const verified = await this.passwords.verify(
      account?.passwordHash ?? DUMMY_PASSWORD_HASH,
      command.password,
    );
    if (!account || account.status !== 'active' || !verified) {
      await this.recordAudit({
        adminId: account?.id,
        event: 'login_failed',
        outcome: 'failure',
        requestId: command.requestId,
      });
      throw invalidCredentials();
    }

    if (this.passwords.needsRehash(account.passwordHash)) {
      const updatedHash = await this.passwords.hash(command.password);
      try {
        await this.identity.updatePassword(account.id, updatedHash);
      } catch (error: unknown) {
        throw new DependencyUnavailableError(
          'ADMIN_IDENTITY_UNAVAILABLE',
          'Administrative authentication is temporarily unavailable.',
          { cause: error },
        );
      }
    }

    let created;
    try {
      created = await this.sessions.create(account.id);
    } catch (error: unknown) {
      throw sessionUnavailable(error);
    }
    try {
      await this.recordAudit({
        adminId: account.id,
        event: 'login_succeeded',
        outcome: 'success',
        requestId: command.requestId,
      });
    } catch (error: unknown) {
      await this.sessions.revoke(created.sessionToken).catch(() => undefined);
      throw error;
    }
    return {
      adminId: account.id,
      csrfToken: created.csrfToken,
      sessionToken: created.sessionToken,
    };
  }

  async logout(
    sessionToken: string | null,
    csrfToken: string | null,
    requestId?: string,
  ): Promise<void> {
    if (!sessionToken) {
      return;
    }
    let principal: AdminPrincipal | null;
    try {
      principal = await this.sessions.resolve(sessionToken);
    } catch (error: unknown) {
      throw sessionUnavailable(error);
    }
    if (!principal) {
      return;
    }
    this.authorizeCsrf(sessionToken, csrfToken);
    try {
      await this.sessions.revoke(sessionToken);
    } catch (error: unknown) {
      throw sessionUnavailable(error);
    }
    await this.recordAudit({
      adminId: principal.adminId,
      event: 'logout',
      outcome: 'success',
      requestId,
    });
  }

  async changePassword(
    principal: AdminPrincipal,
    currentPassword: string,
    newPassword: string,
    requestId?: string,
  ): Promise<void> {
    try {
      validateAdminPassword(newPassword, {
        maximumLength: this.config.auth.passwordMaximumLength,
        minimumLength: this.config.auth.passwordMinimumLength,
      });
    } catch (error: unknown) {
      throw new ApplicationError(
        'PASSWORD_POLICY_VIOLATION',
        error instanceof Error ? error.message : 'The password does not satisfy policy.',
        'validation',
      );
    }
    let account;
    try {
      account = await this.identity.findById(principal.adminId);
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'ADMIN_IDENTITY_UNAVAILABLE',
        'Administrative authentication is temporarily unavailable.',
        { cause: error },
      );
    }
    if (
      !account ||
      account.status !== 'active' ||
      !(await this.passwords.verify(account.passwordHash, currentPassword))
    ) {
      throw invalidCredentials();
    }
    const passwordHash = await this.passwords.hash(newPassword);
    try {
      await this.sessions.revokeAll(account.id);
      await this.identity.updatePassword(account.id, passwordHash);
      await this.sessions.revokeAll(account.id);
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'ADMIN_CREDENTIAL_UPDATE_UNAVAILABLE',
        'The credential update could not be completed.',
        { cause: error },
      );
    }
    await this.recordAudit({
      adminId: account.id,
      event: 'password_changed',
      outcome: 'success',
      requestId,
    });
  }

  private async recordAudit(entry: Parameters<AuthAudit['record']>[0]): Promise<void> {
    try {
      await this.audit.record(entry);
    } catch (error: unknown) {
      throw new DependencyUnavailableError(
        'AUTH_AUDIT_UNAVAILABLE',
        'Administrative authentication is temporarily unavailable.',
        { cause: error },
      );
    }
  }
}
