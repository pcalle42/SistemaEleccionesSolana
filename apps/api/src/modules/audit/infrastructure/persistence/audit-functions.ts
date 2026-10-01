import type pg from 'pg';
import { canonicalDigestV1, type CanonicalValue } from '@votaciones/verification-protocol';
import { sql, type SQL } from 'drizzle-orm';

import type { AuditCheckpointRecord } from '../../application/ports/audit-repository.port.js';
import type { AppendAuditEvent, AppendedAuditEvent } from '../../domain/audit-event.js';

interface AuditAppendRow extends pg.QueryResultRow {
  event_hash: string;
  occurred_at: Date;
  sequence: string;
}

interface CheckpointRow extends pg.QueryResultRow {
  checkpoint_version: string;
  created_at: Date;
  from_sequence: string;
  head_hash: string;
  id: string;
  stream_id: string;
  to_sequence: string;
}

interface PgExecutor {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

interface DrizzleExecutor {
  execute(query: SQL): PromiseLike<{ rows: readonly unknown[] }>;
}

function payloadDigest(payload: CanonicalValue): string {
  return canonicalDigestV1('votaciones/audit-payload/v1', payload);
}

function appended(row: AuditAppendRow): AppendedAuditEvent {
  return {
    eventHash: row.event_hash,
    occurredAt: row.occurred_at,
    sequence: Number(row.sequence),
  };
}

export async function appendAuditEventPg(
  executor: PgExecutor,
  event: AppendAuditEvent,
): Promise<AppendedAuditEvent> {
  const result = await executor.query<AuditAppendRow>(
    `SELECT sequence::text, event_hash, occurred_at
       FROM audit.append_event(
         $1::text,$2::text,$3::integer,$4::text,$5::uuid,$6::text,$7::uuid,$8::jsonb,$9::text
       )`,
    [
      event.streamId,
      event.eventType,
      event.eventVersion,
      event.actorType,
      event.actorId ?? null,
      event.aggregateType ?? null,
      event.aggregateId ?? null,
      JSON.stringify(event.payload),
      payloadDigest(event.payload),
    ],
  );
  if (!result.rows[0]) throw new Error('AUDIT_APPEND_FAILED');
  return appended(result.rows[0]);
}

export async function appendAuditEventDrizzle(
  executor: DrizzleExecutor,
  event: AppendAuditEvent,
): Promise<AppendedAuditEvent> {
  const result = await executor.execute(
    sql`SELECT sequence::text, event_hash, occurred_at
          FROM audit.append_event(
            ${event.streamId}::text, ${event.eventType}::text, ${event.eventVersion}::integer,
            ${event.actorType}::text,
            ${event.actorId ?? null}::uuid, ${event.aggregateType ?? null}::text,
            ${event.aggregateId ?? null}::uuid, ${JSON.stringify(event.payload)}::jsonb,
            ${payloadDigest(event.payload)}::text
          )`,
  );
  const row = result.rows[0] as AuditAppendRow | undefined;
  if (!row) throw new Error('AUDIT_APPEND_FAILED');
  return appended(row);
}

export async function createCheckpointPg(
  executor: PgExecutor,
  streamId: string,
): Promise<AuditCheckpointRecord> {
  const result = await executor.query<CheckpointRow>(
    `SELECT id, stream_id, from_sequence::text, to_sequence::text, head_hash,
            created_at, checkpoint_version
       FROM audit.create_checkpoint($1)`,
    [streamId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('AUDIT_CHECKPOINT_FAILED');
  return {
    checkpointVersion: row.checkpoint_version,
    createdAt: row.created_at,
    fromSequence: Number(row.from_sequence),
    headHash: row.head_hash,
    id: row.id,
    streamId: row.stream_id,
    toSequence: Number(row.to_sequence),
  };
}

export async function createCheckpointDrizzle(
  executor: DrizzleExecutor,
  streamId: string,
): Promise<AuditCheckpointRecord> {
  const result = await executor.execute(
    sql`SELECT id, stream_id, from_sequence::text, to_sequence::text, head_hash,
               created_at, checkpoint_version
          FROM audit.create_checkpoint(${streamId})`,
  );
  const row = result.rows[0] as CheckpointRow | undefined;
  if (!row) throw new Error('AUDIT_CHECKPOINT_FAILED');
  return {
    checkpointVersion: row.checkpoint_version,
    createdAt: row.created_at,
    fromSequence: Number(row.from_sequence),
    headHash: row.head_hash,
    id: row.id,
    streamId: row.stream_id,
    toSequence: Number(row.to_sequence),
  };
}
