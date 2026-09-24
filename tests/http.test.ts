import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  describe('behind the production reverse proxy', () => {
    beforeEach(() => vi.stubEnv('VERIFYFIRST_PUBLIC_URL', 'https://verify.example.com'));
    afterEach(() => vi.unstubAllEnvs());

    it('accepts the configured public host and its HTTPS origin', () => {
      const request = new Request('http://localhost:3000/api/cases', {
        headers: { host: 'verify.example.com', origin: 'https://verify.example.com' },
      });
      expect(() => guardRequest(request)).not.toThrow();
    });
    it('still accepts loopback requests such as the container health check', () => {
      const request = new Request('http://localhost:3000/api/health', {
        headers: { host: '127.0.0.1:3000' },
      });
      expect(() => guardRequest(request)).not.toThrow();
    });
    it.each<Record<string, string>>([
      { host: 'attacker.example' },
      { host: 'verify.example.com.attacker.example' },
      { host: 'verify.example.com', origin: 'http://verify.example.com' },
      { host: 'verify.example.com', origin: 'https://attacker.example' },
      { host: 'verify.example.com', 'sec-fetch-site': 'cross-site' },
      { host: '127.0.0.1:3000', origin: 'https://verify.example.com' },
    ])('rejects a foreign host or origin %j', (headers) => {
      expect(() =>
        guardRequest(new Request('http://localhost:3000/api/cases', { headers })),
      ).toThrow();
    });
    it('stays localhost-only when the public URL is empty', () => {
      vi.stubEnv('VERIFYFIRST_PUBLIC_URL', '');
      const local = new Request('http://localhost:3000/api/cases', {
        headers: { host: '127.0.0.1:3000' },
      });
      expect(() => guardRequest(local)).not.toThrow();
      const remote = new Request('http://localhost:3000/api/cases', {
        headers: { host: 'verify.example.com' },
      });
      expect(() => guardRequest(remote)).toThrow();
    });
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
