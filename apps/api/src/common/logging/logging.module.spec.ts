import { describe, expect, it } from 'vitest';

import { successfulRequestLog } from './logging.module.js';
import type { RequestWithId } from './request-id.js';

describe('safe HTTP logging', () => {
  it('keeps only approved response metadata', () => {
    const request = {
      baseUrl: '/api/v1',
      id: 'request-12345678',
      method: 'GET',
      route: { path: '/example' },
    } as RequestWithId;
    const response = {
      headers: { authorization: 'Bearer secret' },
      statusCode: 200,
    };
    const loggableObject = {
      req: request,
      res: response,
      responseTime: 7,
    };

    expect(successfulRequestLog(request, response, loggableObject)).toEqual({
      durationMs: 7,
      event: 'http_request_completed',
      method: 'GET',
      requestId: 'request-12345678',
      route: '/api/v1/example',
      statusCode: 200,
    });
  });
});
