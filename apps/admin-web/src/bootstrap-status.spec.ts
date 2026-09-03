import { expectedBootstrapStatus } from '@votaciones/shared-testing';
import { describe, expect, it } from 'vitest';

import { adminWebBootstrapStatus } from './bootstrap-status';

describe('adminWebBootstrapStatus', () => {
  it('resolves shared workspace packages', () => {
    expect(adminWebBootstrapStatus()).toEqual(expectedBootstrapStatus('admin-web'));
  });
});
