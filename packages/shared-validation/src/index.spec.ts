import { describe, expect, it } from 'vitest';

import { isNonEmptyString } from './index.js';

describe('isNonEmptyString', () => {
  it('accepts text with visible characters', () => {
    expect(isNonEmptyString('api')).toBe(true);
  });

  it('rejects non-string and blank values', () => {
    expect(isNonEmptyString('   ')).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
  });
});
