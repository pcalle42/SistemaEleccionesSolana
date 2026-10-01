import type { AppendAuditEvent, AppendedAuditEvent } from '../../domain/audit-event.js';

export interface AuditCheckpointRecord {
  readonly checkpointVersion: string;
  readonly createdAt: Date;
  readonly fromSequence: number;
  readonly headHash: string;
  readonly id: string;
  readonly streamId: string;
  readonly toSequence: number;
}

export interface AuditRepository {
  append(event: AppendAuditEvent): Promise<AppendedAuditEvent>;
  createCheckpoint(streamId: string): Promise<AuditCheckpointRecord>;
  verifyStream(streamId: string): Promise<boolean>;
}
