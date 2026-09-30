export type AdminAccountStatus = 'active' | 'inactive';

export interface AdminAccount {
  readonly id: string;
  readonly passwordHash: string;
  readonly status: AdminAccountStatus;
  readonly username: string;
}

export function normalizeAdminUsername(value: string): string | null {
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}
