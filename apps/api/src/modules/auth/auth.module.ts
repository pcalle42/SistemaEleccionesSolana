import { Module } from '@nestjs/common';

import type { AppConfig } from '../../config/app-config.js';
import { APP_CONFIG } from '../../config/config.tokens.js';
import type { Database } from '../../database/client.js';
import { DATABASE_CLIENT } from '../../database/database.tokens.js';
import type { ValkeyKeyFactory } from '../../valkey/key-factory.js';
import type { ValkeyService } from '../../valkey/valkey.service.js';
import { VALKEY_KEYS, VALKEY_SERVICE } from '../../valkey/valkey.tokens.js';
import { AdminAuthService } from './application/admin-auth.service.js';
import {
  ADMIN_IDENTITY_PROVIDER,
  ADMIN_SESSION_STORE,
  AUTH_AUDIT,
  LOGIN_RATE_LIMITER,
  PASSWORD_HASHER,
} from './auth.tokens.js';
import { DrizzleAuthAudit } from './infrastructure/audit/drizzle-auth-audit.js';
import { LocalAdminIdentityProvider } from './infrastructure/local-identity-provider/local-admin-identity-provider.js';
import { Argon2PasswordHasher } from './infrastructure/password-hasher/argon2-password-hasher.js';
import { ValkeyLoginRateLimiter } from './infrastructure/rate-limit/valkey-login-rate-limiter.js';
import { ValkeyAdminSessionStore } from './infrastructure/session-store/valkey-admin-session-store.js';
import { AdminAuthGuard } from './http/admin-auth.guard.js';
import { AdminNoStoreInterceptor } from './http/admin-no-store.interceptor.js';
import { AuthController } from './http/auth.controller.js';
import { CsrfGuard } from './http/csrf.guard.js';

@Module({
  controllers: [AuthController],
  exports: [
    AdminAuthService,
    ADMIN_SESSION_STORE,
    AdminAuthGuard,
    CsrfGuard,
    AdminNoStoreInterceptor,
  ],
  providers: [
    {
      inject: [DATABASE_CLIENT],
      provide: ADMIN_IDENTITY_PROVIDER,
      useFactory: (database: Database) => new LocalAdminIdentityProvider(database),
    },
    {
      inject: [DATABASE_CLIENT],
      provide: AUTH_AUDIT,
      useFactory: (database: Database) => new DrizzleAuthAudit(database),
    },
    {
      inject: [APP_CONFIG],
      provide: PASSWORD_HASHER,
      useFactory: (config: AppConfig) => new Argon2PasswordHasher(config.auth.argon2),
    },
    {
      inject: [VALKEY_SERVICE, VALKEY_KEYS, APP_CONFIG],
      provide: ADMIN_SESSION_STORE,
      useFactory: (valkey: ValkeyService, keys: ValkeyKeyFactory, config: AppConfig) =>
        new ValkeyAdminSessionStore(valkey, keys, config.auth),
    },
    {
      inject: [VALKEY_SERVICE, VALKEY_KEYS, APP_CONFIG],
      provide: LOGIN_RATE_LIMITER,
      useFactory: (valkey: ValkeyService, keys: ValkeyKeyFactory, config: AppConfig) =>
        new ValkeyLoginRateLimiter(valkey, keys, config.auth.rateLimit),
    },
    AdminAuthService,
    AdminAuthGuard,
    CsrfGuard,
    AdminNoStoreInterceptor,
  ],
})
export class AuthModule {}
