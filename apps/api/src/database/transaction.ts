import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type * as schema from './schema/index.js';

export type Transaction = Parameters<
  Parameters<NodePgDatabase<typeof schema>['transaction']>[0]
>[0];

export async function inTransaction<T>(
  database: NodePgDatabase<typeof schema>,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return database.transaction(work);
}
