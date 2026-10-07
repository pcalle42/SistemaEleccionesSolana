import { describe, expect, it, vi } from 'vitest';
import { VotingApiClient } from './public-clients.js';

describe('VotingApiClient privacy boundary', () => {
  it('omits credentials and sends only the protocol proof contract', async () => {
    const fetcher: typeof fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.credentials).toBe('omit');
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON string body.');
      expect(JSON.parse(init.body)).toEqual({
        proof: { protocol: 'groth16' },
        protocolVersion: 'v1',
        publicSignals: ['1'],
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            receipt: {
              electionId: '018f47f2-a7e3-7f1c-8a55-40db41d61c34',
              nullifier: '1',
              receiptCommitment: 'a'.repeat(64),
              receiptVersion: 'vote-receipt-v1',
            },
            status: 'ACCEPTED',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    });
    await new VotingApiClient('http://api', fetcher).cast('018f47f2-a7e3-7f1c-8a55-40db41d61c34', {
      proof: { protocol: 'groth16' } as never,
      protocolVersion: 'v1',
      publicSignals: ['1'],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
