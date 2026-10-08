import { describe, expect, it } from 'vitest';

import { safeRequestLogFields, successfulRequestLog } from './logging.module.js';
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

  it('does not serialize privacy canaries from request-controlled fields', () => {
    const canaries = {
      activationToken: 'CANARY-ACTIVATION-6f7d4a',
      cookie: 'CANARY-COOKIE-f601c3',
      merklePath: 'CANARY-MERKLE-b57a02',
      password: 'CANARY-PASSWORD-e7e08c',
      proof: 'CANARY-PROOF-5bc90b',
      publicSignals: 'CANARY-SIGNALS-937daa',
      voterSecret: 'CANARY-VOTER-2fd349',
      witness: 'CANARY-WITNESS-bfeec9',
    };
    const request = {
      baseUrl: '/api/v1',
      body: canaries,
      headers: {
        authorization: canaries.activationToken,
        cookie: canaries.cookie,
        'x-csrf-token': canaries.password,
      },
      id: 'request-87654321',
      method: 'POST',
      query: canaries,
      route: { path: '/elections/:electionId/votes' },
    } as unknown as RequestWithId;

    const serialized = JSON.stringify(safeRequestLogFields(request));
    expect(JSON.parse(serialized)).toEqual({
      id: 'request-87654321',
      method: 'POST',
      route: '/api/v1/elections/:electionId/votes',
    });
    for (const canary of Object.values(canaries)) expect(serialized).not.toContain(canary);
  });
});
