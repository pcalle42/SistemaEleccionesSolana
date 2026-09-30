import type { AdminAccount } from '../../domain/admin-account.js';

export interface IdentityProvider {
  findById(id: string): Promise<AdminAccount | null>;
  findByUsername(username: string): Promise<AdminAccount | null>;
  updatePassword(adminId: string, passwordHash: string): Promise<void>;
}
