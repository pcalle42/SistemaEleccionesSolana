import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { ApplicationError, type ErrorCategory } from '../errors/application-error.js';
import type { ErrorResponseDto } from '../errors/error-response.dto.js';
import type { RequestWithId } from '../logging/request-id.js';

const statusByCategory: Record<ErrorCategory, number> = {
  authentication: HttpStatus.UNAUTHORIZED,
  authorization: HttpStatus.FORBIDDEN,
  conflict: HttpStatus.CONFLICT,
  'dependency-unavailable': HttpStatus.SERVICE_UNAVAILABLE,
  'domain-rule': HttpStatus.CONFLICT,
  internal: HttpStatus.INTERNAL_SERVER_ERROR,
  'not-found': HttpStatus.NOT_FOUND,
  'rate-limit': HttpStatus.TOO_MANY_REQUESTS,
  validation: HttpStatus.BAD_REQUEST,
};

interface PublicError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}

function fromHttpStatus(status: number): PublicError {
  const byStatus: Record<number, Pick<PublicError, 'code' | 'message'>> = {
    [HttpStatus.BAD_REQUEST]: { code: 'VALIDATION_FAILED', message: 'Request validation failed.' },
    [HttpStatus.UNAUTHORIZED]: { code: 'UNAUTHENTICATED', message: 'Authentication is required.' },
    [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: 'The operation is not allowed.' },
    [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
    [HttpStatus.CONFLICT]: {
      code: 'CONFLICT',
      message: 'The request conflicts with current state.',
    },
    [HttpStatus.PAYLOAD_TOO_LARGE]: {
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request payload is too large.',
    },
    [HttpStatus.TOO_MANY_REQUESTS]: { code: 'RATE_LIMITED', message: 'Too many requests.' },
    [HttpStatus.SERVICE_UNAVAILABLE]: {
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'A required dependency is unavailable.',
    },
  };
  return { ...(byStatus[status] ?? byStatus[HttpStatus.BAD_REQUEST]!), status };
}

function externalHttpStatus(exception: unknown): number | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const candidate = exception as { status?: unknown; statusCode?: unknown };
  const status = candidate.statusCode ?? candidate.status;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<unknown>();
    const requestId = request.id ?? 'unavailable';
    const publicError = this.toPublicError(exception);

    if (
      !(exception instanceof HttpException) &&
      !(exception instanceof ApplicationError) &&
      externalHttpStatus(exception) === undefined
    ) {
      this.logger.error({
        errorType: exception instanceof Error ? exception.name : 'UnknownError',
        event: 'unhandled_exception',
        requestId,
      });
    }

    const body: ErrorResponseDto = {
      error: { code: publicError.code, message: publicError.message, requestId },
    };
    this.adapterHost.httpAdapter.reply(response, body, publicError.status);
  }

  private toPublicError(exception: unknown): PublicError {
    if (exception instanceof ApplicationError) {
      return {
        code: exception.code,
        message: exception.publicMessage,
        status: statusByCategory[exception.category],
      };
    }
    if (exception instanceof HttpException) {
      return fromHttpStatus(exception.getStatus());
    }
    const status = externalHttpStatus(exception);
    if (status !== undefined) {
      return fromHttpStatus(status);
    }
    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
