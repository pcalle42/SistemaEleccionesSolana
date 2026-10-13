import type { NextFunction, Request, Response } from 'express';
import { performance } from 'node:perf_hooks';

import { routeTemplate } from '../common/logging/logging.module.js';
import type { RequestWithId } from '../common/logging/request-id.js';
import type { OperationalMetricsService } from './metrics.service.js';

export function createHttpMetricsMiddleware(metrics: OperationalMetricsService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const startedAt = performance.now();
    response.once('finish', () => {
      metrics.recordHttp(
        routeTemplate(request as RequestWithId),
        response.statusCode,
        performance.now() - startedAt,
      );
    });
    next();
  };
}
