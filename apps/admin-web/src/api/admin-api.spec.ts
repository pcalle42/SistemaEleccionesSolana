import { describe, expect, it, vi } from 'vitest';
import { AdminApiClient } from './admin-api.js';

describe('AdminApiClient session boundary', () => {
  it('uses cookies only for admin and applies the in-memory CSRF token to mutations', async () => {
    let call = 0;
    const fetcher: typeof fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
      call += 1;
      if (call === 1)
        return Promise.resolve(
          new Response(JSON.stringify({ adminId: 'a', csrfToken: 'csrf' }), { status: 200 }),
        );
      expect(init?.credentials).toBe('include');
      expect(new Headers(init?.headers).get('x-csrf-token')).toBe('csrf');
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'x', title: 'E', status: 'DRAFT', options: [] }), {
          status: 201,
        }),
      );
    });
    const client = new AdminApiClient('http://api', fetcher);
    await client.login('admin', 'password');
    await client.createElection({ title: 'E' });
  });
});
