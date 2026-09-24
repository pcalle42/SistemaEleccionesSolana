import { VALKEY_KEY_VERSION } from './valkey.constants.js';

declare const valkeyKeyBrand: unique symbol;
export type ValkeyKey = string & { readonly [valkeyKeyBrand]: true };

function segment(value: string, label: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} must be an opaque, namespace-safe identifier`);
  }
  return value;
}

function validatedSubjectDigest(value: string): string {
  if (!/^[A-Fa-f0-9]{64}$/.test(value)) {
    throw new Error('subject digest must be a SHA-256-style hexadecimal digest');
  }
  return value.toLowerCase();
}

export class ValkeyKeyFactory {
  readonly #prefix: string;

  constructor(environment: string) {
    this.#prefix = `votaciones:${segment(environment, 'environment')}:${VALKEY_KEY_VERSION}`;
  }

  authLoginRate(subjectDigest: string): ValkeyKey {
    return this.#key('auth', 'login-rate', validatedSubjectDigest(subjectDigest));
  }

  publicElectionCache(electionId: string): ValkeyKey {
    return this.#key('cache', 'election-public', segment(electionId, 'election ID'));
  }

  temporaryChallenge(challengeId: string): ValkeyKey {
    return this.#key('challenge', 'temporary', segment(challengeId, 'challenge ID'));
  }

  testProbe(probeId: string): ValkeyKey {
    return this.#key('test', 'probe', segment(probeId, 'probe ID'));
  }

  #key(domain: string, purpose: string, identifier: string): ValkeyKey {
    return `${this.#prefix}:${domain}:${purpose}:${identifier}` as ValkeyKey;
  }
}
