import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import type { AppConfig } from '../../../config/app-config.js';
import { APP_CONFIG } from '../../../config/config.tokens.js';
import { AdminAuthService } from '../application/admin-auth.service.js';
import {
  readCookie,
  readCsrfHeader,
  validateMutationOrigin,
  type AdminRequest,
} from './auth-http.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    validateMutationOrigin(request, this.config);
    this.auth.authorizeCsrf(
      readCookie(request, this.config.auth.cookieName),
      readCsrfHeader(request, this.config.auth.csrfHeaderName),
    );
    return true;
  }
}
