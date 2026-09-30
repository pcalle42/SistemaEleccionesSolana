import { describe, expect, it } from 'vitest';

import { validateAdminPassword } from '../../domain/password-policy.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher({
    memoryCostKiB: 19_456,
    parallelism: 1,
    timeCost: 2,
  });

  it('hashes with Argon2id and verifies only the correct password', async () => {
    const encoded = await hasher.hash('a sufficiently long password');
    expect(encoded).toMatch(/^\$argon2id\$/u);
    await expect(hasher.verify(encoded, 'a sufficiently long password')).resolves.toBe(true);
    await expect(hasher.verify(encoded, 'incorrect password')).resolves.toBe(false);
  });

  it('detects parameter changes for rehashing', async () => {
    const encoded = await hasher.hash('another sufficiently long password');
    const stronger = new Argon2PasswordHasher({
      memoryCostKiB: 19_456,
      parallelism: 1,
      timeCost: 3,
    });
    expect(hasher.needsRehash(encoded)).toBe(false);
    expect(stronger.needsRehash(encoded)).toBe(true);
  });

  it('enforces password length without truncation', () => {
    const policy = { maximumLength: 256, minimumLength: 16 };
    expect(() => validateAdminPassword('short', policy)).toThrow('between 16 and 256');
    expect(() => validateAdminPassword('x'.repeat(257), policy)).toThrow('between 16 and 256');
    expect(() => validateAdminPassword('correct horse battery staple', policy)).not.toThrow();
  });
});
