import { eq, sql } from 'drizzle-orm';

import type { Database } from '../../../../database/client.js';
import { adminAccount } from '../../../../database/schema/admin.js';
import type { IdentityProvider } from '../../application/ports/identity-provider.port.js';
import type { AdminAccount } from '../../domain/admin-account.js';

function toDomain(row: typeof adminAccount.$inferSelect): AdminAccount {
  return {
    id: row.id,
    passwordHash: row.passwordHash,
    status: row.status === 'active' ? 'active' : 'inactive',
    username: row.username,
  };
}

export class LocalAdminIdentityProvider implements IdentityProvider {
  constructor(private readonly database: Database) {}

  async count(): Promise<number> {
    const [row] = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(adminAccount);
    return row?.count ?? 0;
  }

  async create(username: string, passwordHash: string): Promise<AdminAccount> {
    const [created] = await this.database
      .insert(adminAccount)
      .values({ passwordHash, username })
      .returning();
    if (!created) {
      throw new Error('Administrator creation did not return a row');
    }
    return toDomain(created);
  }

  async findById(id: string): Promise<AdminAccount | null> {
    const [row] = await this.database
      .select()
      .from(adminAccount)
      .where(eq(adminAccount.id, id))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findSole(): Promise<AdminAccount | null> {
    const rows = await this.database.select().from(adminAccount).limit(2);
    if (rows.length > 1) {
      throw new Error('More than one administrator exists');
    }
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<AdminAccount | null> {
    const [row] = await this.database
      .select()
      .from(adminAccount)
      .where(eq(adminAccount.username, username))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async updatePassword(adminId: string, passwordHash: string): Promise<void> {
    const [updated] = await this.database
      .update(adminAccount)
      .set({ passwordChangedAt: new Date(), passwordHash, updatedAt: new Date() })
      .where(eq(adminAccount.id, adminId))
      .returning({ id: adminAccount.id });
    if (!updated) {
      throw new Error('Administrator does not exist');
    }
  }
}
