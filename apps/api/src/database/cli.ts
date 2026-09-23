import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDatabase } from './client.js';
import { loadDatabaseEnvironment } from './config/environment.js';
import { checkDatabaseHealth } from './health.js';
import { createDatabasePool } from './pool.js';
import { runSeeds } from './seeds/index.js';

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

type Command = 'health' | 'migrate' | 'seed' | 'status';
type Target = 'default' | 'test';

function parseArguments(arguments_: readonly string[]): { command: Command; target: Target } {
  const command = arguments_[0];
  if (!['health', 'migrate', 'seed', 'status'].includes(command ?? '')) {
    throw new Error('Usage: cli.ts <health|migrate|seed|status> [--target test]');
  }

  const targetIndex = arguments_.indexOf('--target');
  const target = targetIndex === -1 ? 'default' : arguments_[targetIndex + 1];
  if (!['default', 'test'].includes(target ?? '')) {
    throw new Error('Database target must be default or test');
  }

  return { command: command as Command, target: target as Target };
}

function selectTargetEnvironment(environment: NodeJS.ProcessEnv, target: Target): void {
  if (target === 'test') {
    environment['DATABASE_MIGRATION_URL'] = environment['TEST_DATABASE_MIGRATION_URL'];
    environment['DATABASE_URL'] = environment['TEST_DATABASE_URL'];
  }
}

async function migrationFileCount(): Promise<number> {
  const entries = await readdir(migrationsFolder, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).length;
}

async function run(command: Command): Promise<void> {
  if (command === 'migrate') {
    const pool = createDatabasePool('migration');
    try {
      await migrate(createDatabase(pool), {
        migrationsFolder,
        migrationsSchema: 'drizzle',
        migrationsTable: '__drizzle_migrations',
      });
      console.log('Database migrations applied successfully.');
    } finally {
      await pool.end();
    }
    return;
  }

  if (command === 'status') {
    const pool = createDatabasePool('migration');
    try {
      const relation = await pool.query<{ relation: string | null }>(
        'SELECT to_regclass($1)::text AS relation',
        ['drizzle.__drizzle_migrations'],
      );
      const applied = relation.rows[0]?.relation
        ? await pool.query<{ count: string }>(
            'SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations',
          )
        : { rows: [{ count: '0' }] };
      console.log(
        `Migration status: ${applied.rows[0]?.count ?? '0'} applied, ${await migrationFileCount()} files.`,
      );
    } finally {
      await pool.end();
    }
    return;
  }

  const pool = createDatabasePool('runtime');
  try {
    if (command === 'health') {
      await checkDatabaseHealth(pool);
      console.log('Database health check passed.');
      return;
    }

    const count = await runSeeds(createDatabase(pool));
    console.log(`Database seeds completed: ${count}.`);
  } finally {
    await pool.end();
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown database error';
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[database URL redacted]');
}

loadDatabaseEnvironment();
const options = parseArguments(process.argv.slice(2));
selectTargetEnvironment(process.env, options.target);

run(options.command).catch((error: unknown) => {
  console.error(`Database command failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
