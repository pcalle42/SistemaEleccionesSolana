import { loadEnvironment } from '../config/environment.js';
import { checkValkeyHealth } from './valkey.health.js';
import { createValkeyModule } from './valkey.module.js';

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown Valkey error';
}

loadEnvironment();
const command = process.argv[2];
if (command !== 'health') {
  throw new Error('Usage: cli.ts health');
}

const valkey = createValkeyModule();

async function run(): Promise<void> {
  try {
    await valkey.service.connect();
    await checkValkeyHealth(valkey.service);
    console.log('Valkey health check passed.');
  } finally {
    await valkey.service.disconnect();
  }
}

run().catch((error: unknown) => {
  console.error(`Valkey command failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
