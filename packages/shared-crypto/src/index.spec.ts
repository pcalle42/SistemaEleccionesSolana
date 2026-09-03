import { describe, expect, it } from 'vitest';

import { bytesToHex } from './index.js';

describe('bytesToHex', () => {
  it('encodes every byte with two lowercase hexadecimal characters', () => {
    expect(bytesToHex(Uint8Array.of(0, 15, 255))).toBe('000fff');
  });
});
