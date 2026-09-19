import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupPhoneReputation, parsePhoneReputation } from '../apps/mcp/src/ipqs.ts';

beforeEach(() => {
  vi.stubEnv('IPQS_API_KEY', 'unit-test-credential');
  vi.stubEnv('IPQS_API_KEY_FILE', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('IPQS privacy and typed signals', () => {
  it('preserves zero, false and unavailable values while discarding identity enrichment', () => {
    const result = parsePhoneReputation({
      success: true,
      valid: true,
      fraud_score: 0,
      active: null,
      risky: false,
      recent_abuse: false,
      spammer: false,
      VOIP: true,
      prepaid: false,
      carrier: 'Example carrier',
      line_type: 'VOIP',
      country: 'US',
      region: 'N/A',
      name: 'PRIVATE OWNER',
      associated_email_addresses: { emails: ['private@example.com'] },
      identity_data: { address: 'PRIVATE ADDRESS' },
      formatted: '+12025550147',
      request_id: 'secret',
    });
    expect(result).toEqual({
      status: 'available',
      signals: {
        valid: true,
        fraud_score: 0,
        active: null,
        risky: false,
        recent_abuse: false,
        spammer: false,
        VOIP: true,
        prepaid: false,
        carrier: 'Example carrier',
        line_type: 'VOIP',
        country: 'US',
        region: null,
      },
    });
  });
  it('rejects unsuccessful responses and malformed field types without retaining provider messages', () => {
    expect(parsePhoneReputation({ success: false, message: 'secret', valid: false })).toMatchObject(
      { status: 'unavailable' },
    );
    expect(
      parsePhoneReputation({
        success: true,
        fraud_score: 101,
        valid: 'true',
        active: 1,
        carrier: '<script>',
        region: {},
      }),
    ).toMatchObject({ status: 'unavailable' });
    expect(parsePhoneReputation(null)).toMatchObject({ status: 'unavailable' });
  });
});
describe('IPQS runtime boundary', () => {
  it('uses the credential only in a header and the normalized number only in the POST body', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, fraud_score: 0, risky: false })),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await lookupPhoneReputation('+12025550147')).toEqual({
      status: 'available',
      signals: { fraud_score: 0, risky: false },
    });
    const [url, request] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://www.ipqualityscore.com/api/json/phone/');
    expect(request.headers).toEqual({
      'Content-Type': 'application/json',
      'IPQS-KEY': 'unit-test-credential',
    });
    expect(request.redirect).toBe('error');
    expect(typeof request.body).toBe('string');
    expect(JSON.parse(request.body as string)).toEqual({ phone: '+12025550147', strictness: 0 });
    expect(request.body).not.toContain('unit-test-credential');
  });
  it('performs no request when optional credentials are absent or a number is invalid', async () => {
    vi.stubEnv('IPQS_API_KEY', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await lookupPhoneReputation('+12025550147')).toMatchObject({ status: 'unconfigured' });
    expect(await lookupPhoneReputation('https://localhost')).toMatchObject({
      status: 'unavailable',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 429, 503])(
    'degrades HTTP %s without reflecting the response or credentials',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('PRIVATE BODY', { status })));
      const result = await lookupPhoneReputation('+12025550147');
      expect(result.status).toBe('unavailable');
      expect(JSON.stringify(result)).not.toMatch(/PRIVATE|unit-test-credential/);
    },
  );
  it('bounds response size and rejects malformed JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('x'.repeat(65537)))
        .mockResolvedValueOnce(new Response('{bad')),
    );
    expect(await lookupPhoneReputation('+12025550147')).toMatchObject({ status: 'unavailable' });
    expect(await lookupPhoneReputation('+12025550147')).toMatchObject({ status: 'unavailable' });
  });
  it('aborts at the deadline and sanitizes thrown errors', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('unit-test-credential')));
          }),
      ),
    );
    const pending = lookupPhoneReputation('+12025550147');
    await vi.advanceTimersByTimeAsync(8000);
    const result = await pending;
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('unit-test-credential');
  });
  it('sanitizes inaccessible credential-file errors', async () => {
    vi.stubEnv('IPQS_API_KEY', '');
    vi.stubEnv('IPQS_API_KEY_FILE', '/unavailable/credential-file');
    const result = await lookupPhoneReputation('+12025550147');
    expect(result.status).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('/unavailable');
  });
});
