import { describe, expect, it } from 'vitest';

import { OperationalMetricsService } from './metrics.service.js';

describe('OperationalMetricsService', () => {
  it('exports only aggregate bounded-cardinality voting and HTTP dimensions', () => {
    const metrics = new OperationalMetricsService();
    metrics.recordHttp('/api/v1/elections/:electionId/votes', 202, 25);
    metrics.recordHttp('/api/v1/elections/individual-id/votes?receipt=secret', 400, 3);
    metrics.recordVoteAccepted(false);
    metrics.recordVoteRejected('invalid_proof');
    metrics.proofStarted();
    metrics.proofFinished(12);
    metrics.observeVoteAcceptance(8);

    const output = metrics.renderOpenMetrics();
    expect(output).toContain(
      'http_requests_total{route="/api/v1/elections/:electionId/votes",service="votaciones-api",status_class="2xx"} 1',
    );
    expect(output).toContain(
      'http_requests_total{route="/unmatched",service="votaciones-api",status_class="4xx"} 1',
    );
    expect(output).toContain('vote_rejected_total{reason_class="invalid_proof"} 1');
    expect(output).toContain('proof_verification_inflight 0');
    expect(output).not.toMatch(
      /(?:voter|credential|nullifier|receipt|session|individual-id|secret)/iu,
    );
  });

  it('exports dependency health without hosts, database names, or keys', () => {
    const metrics = new OperationalMetricsService();
    metrics.recordPostgresHealth(4, 'healthy', {
      idleCount: 2,
      totalCount: 3,
      waitingCount: 0,
    });
    metrics.recordValkeyHealth(2, 'unavailable');
    const output = metrics.renderOpenMetrics();
    expect(output).toContain('postgres_connections{state="total"} 3');
    expect(output).toContain('valkey_health_total{result="unavailable"} 1');
    expect(output).not.toMatch(/(?:host|password|database|key)=/iu);
  });
});
