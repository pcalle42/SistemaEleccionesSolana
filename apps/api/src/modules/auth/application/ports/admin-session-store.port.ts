import type { AdminPrincipal } from '../../domain/admin-principal.js';

export interface CreatedAdminSession {
  readonly csrfToken: string;
  readonly principal: AdminPrincipal;
  readonly sessionToken: string;
}

export interface AdminSessionStore {
  create(adminId: string): Promise<CreatedAdminSession>;
  csrfToken(sessionToken: string): string;
  resolve(sessionToken: string): Promise<AdminPrincipal | null>;
  revoke(sessionToken: string): Promise<void>;
  revokeAll(adminId: string): Promise<void>;
  verifyCsrf(sessionToken: string, csrfToken: string): boolean;
}
