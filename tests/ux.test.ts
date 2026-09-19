import { describe, expect, it } from 'vitest';
import { extractMessageUrls, MAX_INVESTIGATION_URLS } from '../agent/input';
import { formatElapsed } from '../apps/web/app/components/input-helpers';

describe('message-paste link detection', () => {
  it('keeps all distinct links and removes common prose punctuation', () => {
    expect(
      extractMessageUrls(
        'Check (https://bank.example/check), then https://second.example/help. Again: https://bank.example/check',
      ),
    ).toEqual(['https://bank.example/check', 'https://second.example/help']);
  });
  it('retains balanced URL parentheses and ignores non-web schemes', () => {
    expect(
      extractMessageUrls(
        'https://example.com/wiki/Test_(topic) javascript:alert(1) mailto:person@example.com',
      ),
    ).toEqual(['https://example.com/wiki/Test_(topic)']);
  });
  it('separates adjacent link lists without splitting commas within URL values', () => {
    expect(
      extractMessageUrls(
        'https://one.example,https://two.example，https://three.example;https://four.example',
      ),
    ).toEqual([
      'https://one.example',
      'https://two.example',
      'https://three.example',
      'https://four.example',
    ]);
    expect(
      extractMessageUrls('https://one.example/a,b?values=1,2&next=https://two.example'),
    ).toEqual(['https://one.example/a,b?values=1,2&next=https://two.example']);
  });
  it('does not silently truncate a paste above the investigation limit', () => {
    const message = Array.from(
      { length: MAX_INVESTIGATION_URLS + 1 },
      (_, index) => `https://link-${index}.example/`,
    ).join(' ');
    expect(extractMessageUrls(message)).toHaveLength(MAX_INVESTIGATION_URLS + 1);
  });
});

describe('activity elapsed presentation', () => {
  it('preserves subsecond precision and keeps long durations readable', () => {
    expect(formatElapsed(420)).toBe('420 ms');
    expect(formatElapsed(1420)).toBe('1.4 s');
    expect(formatElapsed(62420)).toBe('1 min 2 s');
  });
});
