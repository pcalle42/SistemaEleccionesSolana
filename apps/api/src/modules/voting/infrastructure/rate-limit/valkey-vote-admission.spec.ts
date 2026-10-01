import { describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../../../config/app-config.js';
import { ValkeyKeyFactory } from '../../../../valkey/key-factory.js';
import { ValkeyUnavailableError, type ValkeyService } from '../../../../valkey/valkey.service.js';
import { ValkeyVoteAdmission } from './valkey-vote-admission.js';

const config: AppConfig['voting'] = {
  maximumConcurrentProofs: 1,
  rateLimitMaximum: 2,
  rateLimitWindowSeconds: 60,
};

describe('ValkeyVoteAdmission', () => {
  it('rate limits an ephemeral network digest before expensive work', async () => {
    const incrementWithExpiry = vi.fn().mockResolvedValue({ count: 3, ttlSeconds: 30 });
    const valkey = {
      incrementWithExpiry,
    } as unknown as ValkeyService;
    const admission = new ValkeyVoteAdmission(valkey, new ValkeyKeyFactory('test'), config);
    const work = vi.fn();
    await expect(admission.execute('192.0.2.1', work)).rejects.toMatchObject({
      code: 'VOTE_RATE_LIMITED',
    });
    expect(work).not.toHaveBeenCalled();
    expect(incrementWithExpiry).toHaveBeenCalledWith(
      expect.stringMatching(/:voting:rate-network:[0-9a-f]{64}$/u),
      60,
    );
  });

  it('bounds concurrent proof work even when Valkey is unavailable', async () => {
    const valkey = {
      incrementWithExpiry: vi.fn().mockRejectedValue(new ValkeyUnavailableError('test')),
    } as unknown as ValkeyService;
    const admission = new ValkeyVoteAdmission(valkey, new ValkeyKeyFactory('test'), config);
    let release!: () => void;
    const first = admission.execute(
      '192.0.2.1',
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await expect(admission.execute('192.0.2.2', () => Promise.resolve())).rejects.toMatchObject({
      code: 'VOTE_RATE_LIMITED',
    });
    release();
    await expect(first).resolves.toBeUndefined();
  });
});
