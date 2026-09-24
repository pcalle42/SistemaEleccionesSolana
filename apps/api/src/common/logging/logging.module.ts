import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import type { AppConfig } from '../../config/app-config.js';
import { RuntimeConfigModule } from '../../config/config.module.js';
import { APP_CONFIG } from '../../config/config.tokens.js';
import { resolveRequestId, type RequestWithId } from './request-id.js';

function routeTemplate(request: RequestWithId): string {
  const route = request.route as unknown;
  const path =
    typeof route === 'object' && route !== null ? (route as { path?: unknown }).path : undefined;
  if (typeof path === 'string' && path) {
    return `${request.baseUrl}${path}`;
  }
  return request.path || '/';
}

function asRequestWithId(request: unknown): RequestWithId {
  return request as RequestWithId;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function failedRequestLog(
  request: RequestWithId,
  response: { statusCode: number },
  error: unknown,
): Record<string, unknown> {
  return {
    errorType: errorName(error),
    event: 'http_request_failed',
    method: request.method,
    requestId: request.id,
    route: routeTemplate(request),
    statusCode: response.statusCode,
  };
}

function serializedRequest(request: RequestWithId): Record<string, unknown> {
  return {
    id: request.id,
    method: request.method,
    route: routeTemplate(request),
  };
}

export function successfulRequestLog(
  request: RequestWithId,
  response: { statusCode: number },
  loggableObject: { responseTime?: number },
): Record<string, unknown> {
  return {
    durationMs: loggableObject.responseTime,
    event: 'http_request_completed',
    method: request.method,
    requestId: request.id,
    route: routeTemplate(request),
    statusCode: response.statusCode,
  };
}

@Module({
  exports: [LoggerModule],
  imports: [
    LoggerModule.forRootAsync({
      imports: [RuntimeConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          base: {
            environment: config.environment,
            service: config.logging.service,
          },
          customErrorMessage: () => 'HTTP request failed',
          customErrorObject: (request, response, error) =>
            failedRequestLog(asRequestWithId(request), response, error),
          customSuccessMessage: () => 'HTTP request completed',
          customSuccessObject: (request, response, loggableObject) =>
            successfulRequestLog(
              asRequestWithId(request),
              response,
              loggableObject as { responseTime?: number },
            ),
          genReqId: (request, response) => {
            const typedRequest = asRequestWithId(request);
            const typedResponse = response as unknown as {
              setHeader(name: string, value: string): void;
            };
            const requestId =
              typedRequest.id ?? resolveRequestId(typedRequest.headers['x-request-id']);
            typedResponse.setHeader('x-request-id', requestId);
            return requestId;
          },
          level: config.logging.level,
          redact: {
            censor: '[REDACTED]',
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers.proxy-authorization',
              'DATABASE_URL',
              'VALKEY_URL',
              '*.password',
              '*.token',
              '*.secret',
              '*.witness',
              '*.proof',
            ],
          },
          serializers: {
            err: (error) => ({ type: errorName(error) }),
            req: (request) => serializedRequest(asRequestWithId(request)),
            res: (response) => ({
              statusCode: (response as unknown as { statusCode?: number }).statusCode,
            }),
          },
        },
      }),
    }),
  ],
})
export class ApplicationLoggingModule {}
