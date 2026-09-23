import { defineConfig } from 'drizzle-kit';

import { getDatabaseConfig } from './src/database/config/database-config.js';
import { loadDatabaseEnvironment } from './src/database/config/environment.js';

loadDatabaseEnvironment();

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseConfig(process.env, 'migration').connectionString,
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
  out: './drizzle',
  schema: './src/database/schema/index.ts',
  strict: true,
  verbose: true,
});
