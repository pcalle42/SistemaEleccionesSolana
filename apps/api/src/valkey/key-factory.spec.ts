import { describe, expect, it } from 'vitest';

import { ValkeyKeyFactory } from './key-factory.js';

describe('ValkeyKeyFactory', () => {
  it('creates versioned, environment-isolated keys', () => {
    const local = new ValkeyKeyFactory('local').publicElectionCache('election_42');
    const test = new ValkeyKeyFactory('test').publicElectionCache('election_42');

    expect(local).toBe('votaciones:local:v1:cache:election-public:election_42');
    expect(test).not.toBe(local);
  });

  it('rejects arbitrary separators and raw sensitive-looking input', () => {
    const keys = new ValkeyKeyFactory('local');
    expect(() => keys.temporaryChallenge('token:secret')).toThrow('namespace-safe');
    expect(() => keys.authLoginRate('person@example.test')).toThrow('digest');
  });
});
