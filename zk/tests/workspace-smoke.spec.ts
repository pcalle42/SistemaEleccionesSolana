import { describe, expect, it } from 'vitest';

import { ZK_WORKSPACE_NAME } from '../scripts/workspace-smoke.js';

describe('ZK workspace', () => {
  it('compiles scripts and tests independently from applications', () => {
    expect(ZK_WORKSPACE_NAME).toBe('@votaciones/zk');
  });
});
