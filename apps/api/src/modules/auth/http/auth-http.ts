import type { Request, Response } from 'express';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { RequestWithId } from '../../../common/logging/request-id.js';
import type { AppConfig } from '../../../config/app-config.js';
import type { AdminPrincipal } from '../domain/admin-principal.js';

export type AdminRequest = RequestWithId & { adminPrincipal?: AdminPrincipal };

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.cookie;
  if (!header) {
    return null;
  }
  const matches = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) {
    return null;
  }
  const value = matches[0]!.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function readCsrfHeader(request: Request, headerName: string): string | null {
  const value = request.headers[headerName];
  return typeof value === 'string' ? value : null;
}

export function validateMutationOrigin(request: Request, config: AppConfig): void {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && !config.http.corsOrigins.includes(origin)) {
    throw new ApplicationError(
      'ADMIN_ORIGIN_NOT_ALLOWED',
      'The request origin is not allowed.',
      'authorization',
    );
  }
}

export function setAdminSessionCookie(
  response: Response,
  config: AppConfig,
  sessionToken: string,
): void {
  response.cookie(config.auth.cookieName, sessionToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: config.auth.cookieSecure,
  });
}

export function clearAdminSessionCookie(response: Response, config: AppConfig): void {
  response.clearCookie(config.auth.cookieName, {
    httpOnly: true,
    path: '/',
    sameSite: 'strict',
    secure: config.auth.cookieSecure,
  });
}
