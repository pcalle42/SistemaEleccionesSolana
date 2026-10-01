import type { CanonicalValue } from '@votaciones/verification-protocol';

export type AuditActorType = 'ADMIN' | 'SYSTEM' | 'ANONYMOUS';

export interface AppendAuditEvent {
  readonly actorId?: string | null;
  readonly actorType: AuditActorType;
  readonly aggregateId?: string | null;
  readonly aggregateType?: string | null;
  readonly eventType: string;
  readonly eventVersion: 1;
  readonly payload: CanonicalValue;
  readonly streamId: string;
}

export interface AppendedAuditEvent {
  readonly eventHash: string;
  readonly occurredAt: Date;
  readonly sequence: number;
}
