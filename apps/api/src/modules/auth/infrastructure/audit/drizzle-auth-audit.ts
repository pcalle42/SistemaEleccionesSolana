import type { Database } from '../../../../database/client.js';
import { adminAuthEvent } from '../../../../database/schema/audit.js';
import type { AdminAuthAuditEntry, AuthAudit } from '../../application/ports/auth-audit.port.js';

export class DrizzleAuthAudit implements AuthAudit {
  constructor(private readonly database: Database) {}

  async record(entry: AdminAuthAuditEntry): Promise<void> {
    await this.database.insert(adminAuthEvent).values({
      adminId: entry.adminId,
      event: entry.event,
      outcome: entry.outcome,
      requestId: entry.requestId,
    });
  }
}
