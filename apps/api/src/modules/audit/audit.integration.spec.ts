import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabasePool } from '../../database/pool.js';
import { appendAuditEventPg } from './infrastructure/persistence/audit-functions.js';
import { PostgresAuditRepository } from './infrastructure/persistence/postgres-audit.repository.js';

const runtimePool = createDatabasePool('runtime');
const migrationPool = createDatabasePool('migration');
const repository = new PostgresAuditRepository(runtimePool);

function event(streamId: string, index: number) {
  return {
    actorType: 'SYSTEM' as const,
    aggregateType: 'test',
    eventType: 'audit_tested',
    eventVersion: 1 as const,
    payload: { index },
    streamId,
  };
}

async function clearAudit() {
  await migrationPool.query('DELETE FROM audit.audit_checkpoint');
  await migrationPool.query('DELETE FROM audit.audit_event');
  await migrationPool.query('DELETE FROM audit.audit_chain_head');
}

beforeAll(clearAudit);

afterAll(async () => {
  await clearAudit();
  await runtimePool.end();
  await migrationPool.end();
});

describe('append-only audit chain', () => {
  it('serializes concurrent appends and produces a verifiable checkpoint', async () => {
    const streamId = `test:${randomUUID()}`;
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => repository.append(event(streamId, index))),
    );
    await expect(repository.verifyStream(streamId)).resolves.toBe(true);
    const checkpoint = await repository.createCheckpoint(streamId);
    expect(Number.isInteger(checkpoint.fromSequence)).toBe(true);
    expect(checkpoint.headHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(checkpoint.toSequence).toBeGreaterThanOrEqual(checkpoint.fromSequence);
  });

  it('rolls back the audit append with its caller transaction', async () => {
    const streamId = `test:${randomUUID()}`;
    const client = await runtimePool.connect();
    try {
      await client.query('BEGIN');
      await appendAuditEventPg(client, event(streamId, 1));
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const rows = await migrationPool.query('SELECT 1 FROM audit.audit_event WHERE stream_id = $1', [
      streamId,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it('denies direct mutation to runtime and detects privileged tampering', async () => {
    const streamId = `test:${randomUUID()}`;
    const appended = await repository.append(event(streamId, 1));
    await expect(
      runtimePool.query('UPDATE audit.audit_event SET payload = $1::jsonb WHERE event_hash = $2', [
        '{"index":2}',
        appended.eventHash,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await migrationPool.query(
      'UPDATE audit.audit_event SET payload = $1::jsonb WHERE event_hash = $2',
      ['{"index":2}', appended.eventHash],
    );
    await expect(repository.verifyStream(streamId)).resolves.toBe(false);
  });
});
