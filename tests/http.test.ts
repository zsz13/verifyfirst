import { describe, expect, it } from 'vitest';
import { guardRequest, jsonBody } from '../apps/web/app/api/http.ts';

describe('local web request boundary', () => {
  it('accepts the actual loopback Host when Next normalizes the request URL', () => {
    const request = new Request('http://localhost:3000/api/cases', {
      headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' },
    });
    expect(() => guardRequest(request)).not.toThrow();
  });
  it.each<Record<string, string>>([
    { host: 'attacker.example:3000' },
    { host: 'localhost.attacker.example' },
    { host: '127.0.0.1:3000', origin: 'https://attacker.example' },
    { host: '127.0.0.1:3000', 'sec-fetch-site': 'cross-site' },
  ])('rejects a foreign host or origin %j', (headers) => {
    expect(() =>
      guardRequest(new Request('http://localhost:3000/api/cases', { headers })),
    ).toThrow();
  });
  it('limits actual request bytes and rejects non-JSON submissions', async () => {
    await expect(
      jsonBody(new Request('http://localhost', { method: 'POST', body: 'x' })),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      jsonBody(
        new Request('http://localhost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'x'.repeat(20001) }),
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
