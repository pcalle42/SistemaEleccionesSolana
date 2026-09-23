import type { Database } from '../client.js';

export type Seed = (database: Database) => Promise<void>;

// Add deterministic, environment-safe seeds here when a bounded context defines them.
export const seeds: readonly Seed[] = [];

export async function runSeeds(database: Database): Promise<number> {
  for (const seed of seeds) {
    await seed(database);
  }
  return seeds.length;
}
