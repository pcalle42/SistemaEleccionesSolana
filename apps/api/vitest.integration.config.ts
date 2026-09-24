import { defineConfig } from 'vitest/config';

import { loadDatabaseEnvironment } from './src/database/config/environment.js';

loadDatabaseEnvironment();
process.env['DATABASE_MIGRATION_URL'] = process.env['TEST_DATABASE_MIGRATION_URL'];
process.env['DATABASE_URL'] = process.env['TEST_DATABASE_URL'];
process.env['LOG_LEVEL'] = 'silent';
process.env['OPENAPI_ENABLED'] = 'false';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['src/**/*.integration.spec.ts'],
  },
});
