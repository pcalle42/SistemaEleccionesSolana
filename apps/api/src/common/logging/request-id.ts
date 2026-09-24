import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & { id: string };

export function isSafeRequestId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(value);
}

export function resolveRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && isSafeRequestId(candidate) ? candidate : randomUUID();
}

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const typedRequest = request as RequestWithId;
  typedRequest.id ||= resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  response.setHeader(REQUEST_ID_HEADER, typedRequest.id);
  next();
}
