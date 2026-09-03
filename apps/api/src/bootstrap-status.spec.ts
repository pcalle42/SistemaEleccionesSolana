import { expectedBootstrapStatus } from '@votaciones/shared-testing';
import { describe, expect, it } from 'vitest';

import { apiBootstrapStatus } from './bootstrap-status.js';

describe('apiBootstrapStatus', () => {
  it('resolves shared workspace packages', () => {
    expect(apiBootstrapStatus('api')).toEqual(expectedBootstrapStatus('api'));
  });

  it('rejects invalid external input', () => {
    expect(() => apiBootstrapStatus('')).toThrow(TypeError);
  });
});
