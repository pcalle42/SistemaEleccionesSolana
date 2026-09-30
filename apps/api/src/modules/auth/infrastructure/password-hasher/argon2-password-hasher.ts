import * as argon2 from 'argon2';

import type { AppConfig } from '../../../../config/app-config.js';
import type { PasswordHasher } from '../../application/ports/password-hasher.port.js';

export class Argon2PasswordHasher implements PasswordHasher {
  readonly #options: argon2.HashOptions & { raw: false };

  constructor(config: AppConfig['auth']['argon2']) {
    this.#options = {
      memoryCost: config.memoryCostKiB,
      parallelism: config.parallelism,
      raw: false,
      timeCost: config.timeCost,
      type: argon2.argon2id,
    };
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, this.#options);
  }

  needsRehash(passwordHash: string): boolean {
    try {
      return argon2.needsRehash(passwordHash, this.#options);
    } catch {
      return true;
    }
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
