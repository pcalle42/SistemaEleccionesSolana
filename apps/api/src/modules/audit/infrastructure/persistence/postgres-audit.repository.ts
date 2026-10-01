import type pg from 'pg';
import { canonicalDigestV1, type CanonicalValue } from '@votaciones/verification-protocol';

import type {
  AuditCheckpointRecord,
  AuditRepository,
} from '../../application/ports/audit-repository.port.js';
import type { AppendAuditEvent, AppendedAuditEvent } from '../../domain/audit-event.js';
import { appendAuditEventPg, createCheckpointPg } from './audit-functions.js';

interface VerificationRow extends pg.QueryResultRow {
  computed_hash: string;
  event_hash: string;
  head_hash: string;
  head_sequence: string;
  payload: CanonicalValue;
  payload_digest: string;
  previous_hash: string;
  prior_hash: string | null;
  sequence: string;
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: pg.Pool) {}

  append(event: AppendAuditEvent): Promise<AppendedAuditEvent> {
    return appendAuditEventPg(this.pool, event);
  }

  createCheckpoint(streamId: string): Promise<AuditCheckpointRecord> {
    return createCheckpointPg(this.pool, streamId);
  }

  async verifyStream(streamId: string): Promise<boolean> {
    const result = await this.pool.query<VerificationRow>(
      `SELECT event.event_hash, event.previous_hash, event.payload, event.payload_digest,
              event.sequence::text, head.head_hash, head.sequence::text AS head_sequence,
              lag(event.event_hash) OVER (ORDER BY event.sequence) AS prior_hash,
              audit.compute_event_hash(
                event.sequence, event.event_type, event.event_version, event.occurred_at,
                event.actor_type, event.actor_id, event.aggregate_type, event.aggregate_id,
                event.payload_digest, event.previous_hash
              ) AS computed_hash
         FROM audit.audit_event event
         JOIN audit.audit_chain_head head ON head.stream_id = event.stream_id
        WHERE event.stream_id = $1
        ORDER BY event.sequence`,
      [streamId],
    );
    const invalidCheckpoints = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM audit.audit_checkpoint checkpoint
         LEFT JOIN audit.audit_event event
           ON event.stream_id = checkpoint.stream_id
          AND event.sequence = checkpoint.to_sequence
          AND event.event_hash = checkpoint.head_hash
        WHERE checkpoint.stream_id = $1 AND event.id IS NULL`,
      [streamId],
    );
    const last = result.rows.at(-1);
    return (
      result.rows.length > 0 &&
      invalidCheckpoints.rows[0]?.count === '0' &&
      last?.event_hash === last?.head_hash &&
      last?.sequence === last?.head_sequence &&
      result.rows.every(
        (row, index) =>
          row.event_hash === row.computed_hash &&
          row.payload_digest === canonicalDigestV1('votaciones/audit-payload/v1', row.payload) &&
          row.previous_hash === (index === 0 ? '0'.repeat(64) : row.prior_hash),
      )
    );
  }
}
