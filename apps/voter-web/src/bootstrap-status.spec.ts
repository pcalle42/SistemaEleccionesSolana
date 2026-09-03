import { expectedBootstrapStatus } from '@votaciones/shared-testing';
import { describe, expect, it } from 'vitest';

import { voterWebBootstrapStatus } from './bootstrap-status';

describe('voterWebBootstrapStatus', () => {
  it('resolves shared workspace packages', () => {
    expect(voterWebBootstrapStatus()).toEqual(expectedBootstrapStatus('voter-web'));
  });
});
