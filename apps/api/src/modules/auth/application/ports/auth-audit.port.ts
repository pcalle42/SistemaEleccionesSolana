export type AdminAuthEventType =
  | 'admin_created'
  | 'login_succeeded'
  | 'login_failed'
  | 'logout'
  | 'sessions_revoked'
  | 'password_changed'
  | 'password_recovered'
  | 'rate_limited';

export interface AdminAuthAuditEntry {
  readonly adminId?: string | undefined;
  readonly event: AdminAuthEventType;
  readonly outcome: 'success' | 'failure' | 'limited';
  readonly requestId?: string | undefined;
}

export interface AuthAudit {
  record(entry: AdminAuthAuditEntry): Promise<void>;
}
