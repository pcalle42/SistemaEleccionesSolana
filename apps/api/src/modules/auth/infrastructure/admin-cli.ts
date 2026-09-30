import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import { getAppConfig } from '../../../config/app-config.js';
import { loadEnvironment } from '../../../config/environment.js';
import { createDatabase } from '../../../database/client.js';
import { createDatabasePool } from '../../../database/pool.js';
import { createValkeyModuleFromConfig } from '../../../valkey/valkey.module.js';
import { normalizeAdminUsername } from '../domain/admin-account.js';
import { validateAdminPassword } from '../domain/password-policy.js';
import { DrizzleAuthAudit } from './audit/drizzle-auth-audit.js';
import { LocalAdminIdentityProvider } from './local-identity-provider/local-admin-identity-provider.js';
import { Argon2PasswordHasher } from './password-hasher/argon2-password-hasher.js';
import { ValkeyAdminSessionStore } from './session-store/valkey-admin-session-store.js';

type AdminCommand = 'create' | 'reset-password' | 'revoke-sessions';

class MutableOutput extends Writable {
  muted = false;

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!this.muted) {
      process.stdout.write(chunk, encoding);
    }
    callback();
  }
}

function command(arguments_: readonly string[]): AdminCommand {
  if (
    arguments_.length !== 1 ||
    !['create', 'reset-password', 'revoke-sessions'].includes(arguments_[0] ?? '')
  ) {
    throw new Error('Usage: admin-cli.ts <create|reset-password|revoke-sessions>');
  }
  return arguments_[0] as AdminCommand;
}

async function readPipedPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const lines = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/u, '')
    .split(/\r?\n/u);
  if (lines.length !== 1) {
    throw new Error('Piped password input must contain exactly one line');
  }
  return lines[0] ?? '';
}

async function readUsernameAndPassword(includeUsername: boolean): Promise<{
  password: string;
  username?: string;
}> {
  if (!process.stdin.isTTY) {
    const username = includeUsername ? process.env['ADMIN_CREATE_USERNAME'] : undefined;
    if (includeUsername && !username) {
      throw new Error('ADMIN_CREATE_USERNAME is required when stdin is not a TTY');
    }
    return { password: await readPipedPassword(), ...(username ? { username } : {}) };
  }

  const output = new MutableOutput();
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const username = includeUsername
      ? (process.env['ADMIN_CREATE_USERNAME'] ?? (await prompt.question('Username: ')))
      : undefined;
    process.stdout.write('Password: ');
    output.muted = true;
    const password = await prompt.question('');
    output.muted = false;
    process.stdout.write('\nConfirm password: ');
    output.muted = true;
    const confirmation = await prompt.question('');
    output.muted = false;
    process.stdout.write('\n');
    if (password !== confirmation) {
      throw new Error('Password confirmation does not match');
    }
    return { password, ...(username ? { username } : {}) };
  } finally {
    output.muted = false;
    prompt.close();
  }
}

async function run(selected: AdminCommand): Promise<void> {
  loadEnvironment();
  const config = getAppConfig();
  const pool = createDatabasePool('runtime');
  const database = createDatabase(pool);
  const identity = new LocalAdminIdentityProvider(database);
  const audit = new DrizzleAuthAudit(database);
  const hasher = new Argon2PasswordHasher(config.auth.argon2);

  try {
    if (selected === 'create') {
      if ((await identity.count()) !== 0) {
        throw new Error('An administrator already exists');
      }
      const input = await readUsernameAndPassword(true);
      const username = normalizeAdminUsername(input.username ?? '');
      if (!username) {
        throw new Error('Username must be 3-64 characters using letters, numbers, ., _, or -');
      }
      validateAdminPassword(input.password, {
        maximumLength: config.auth.passwordMaximumLength,
        minimumLength: config.auth.passwordMinimumLength,
      });
      const account = await identity.create(username, await hasher.hash(input.password));
      await audit.record({ adminId: account.id, event: 'admin_created', outcome: 'success' });
      console.log('Administrative account created successfully.');
      return;
    }

    const account = await identity.findSole();
    if (!account) {
      throw new Error('No administrative account exists');
    }
    const valkey = createValkeyModuleFromConfig(config.valkey);
    try {
      await valkey.service.connect();
      const sessions = new ValkeyAdminSessionStore(valkey.service, valkey.keys, config.auth);
      if (selected === 'revoke-sessions') {
        await sessions.revokeAll(account.id);
        await audit.record({
          adminId: account.id,
          event: 'sessions_revoked',
          outcome: 'success',
        });
        console.log('Administrative sessions revoked successfully.');
        return;
      }

      const { password } = await readUsernameAndPassword(false);
      validateAdminPassword(password, {
        maximumLength: config.auth.passwordMaximumLength,
        minimumLength: config.auth.passwordMinimumLength,
      });
      await sessions.revokeAll(account.id);
      await identity.updatePassword(account.id, await hasher.hash(password));
      await sessions.revokeAll(account.id);
      await audit.record({
        adminId: account.id,
        event: 'password_recovered',
        outcome: 'success',
      });
      console.log('Administrative password reset and sessions revoked successfully.');
    } finally {
      await valkey.service.disconnect();
    }
  } finally {
    await pool.end();
  }
}

const selected = command(process.argv.slice(2));
run(selected).catch(() => {
  console.error('Administrative command failed. Review configuration and prerequisites.');
  process.exitCode = 1;
});
