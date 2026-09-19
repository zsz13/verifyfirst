import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReportHtml } from '../agent/report-html.ts';
import type { CaseReport } from '../agent/types.ts';

const id = '330c98ce-bf51-4b78-8cc7-0cd0b2b61c7c';
const report: CaseReport = {
  caseId: id,
  risk: 'SUSPICIOUS',
  summary: 'The claimed identity could not be established.',
  evidence: [
    {
      id: 'observation-1',
      kind: 'unknown',
      title: 'An incomplete check',
      detail: 'No independently verified contact was established.',
      observedAt: '2026-09-19T12:30:14.000Z',
      tool: 'verify_organization',
      sourceUrl: 'https://consumer.ftc.gov/scams',
    },
  ],
  comparisons: [{ submitted: 'Claimed company', verified: 'Unconfirmed identity' }],
  injectionDetected: false,
  safeNextActions: ['Contact the organization independently.'],
  limitations: ['This is a point-in-time assessment.'],
  createdAt: '2026-09-19T12:30:15.000Z',
};

describe('standalone human evidence report', () => {
  it('renders evidence, sources, comparisons, second-level times and print styles without scripts', () => {
    const html = renderReportHtml(report);
    for (const content of [
      'SUSPICIOUS',
      report.summary,
      'Checked entities',
      'Unconfirmed identity',
      'Evidence timeline',
      '2026-09-19 12:30:14 UTC',
      'Contact the organization independently.',
      'https://consumer.ftc.gov/scams',
      '@media print',
      'VerifyFirst',
      'not execution durations',
    ])
      expect(html).toContain(content);
    expect(html).not.toMatch(/<script|<iframe|<img|onload=/i);
  });

  it('escapes untrusted content in every rendered text section', () => {
    const attack = '<script>alert("untrusted")</script>';
    const evidence = report.evidence[0];
    if (!evidence) throw new Error('Missing test evidence');
    const html = renderReportHtml({
      ...report,
      summary: attack,
      evidence: [{ ...evidence, title: attack, detail: attack, tool: attack }],
      comparisons: [{ submitted: attack, verified: attack }],
      safeNextActions: [attack],
      limitations: [attack],
    });
    expect(html).not.toContain(attack);
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;alert(&quot;untrusted&quot;)&lt;/script&gt;');
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///private/secret',
    '//attacker.example/payload',
    'https://username:password@example.org/',
  ])('does not render active or credential-bearing source links: %s', (sourceUrl) => {
    const html = renderReportHtml({
      ...report,
      comparisons: [{ submitted: '', verified: '', sourceUrl }],
    });
    expect(html).not.toContain(`href="${sourceUrl}`);
    expect(html).not.toContain('username:password');
  });

  it('removes source query strings/fragments and escapes URL attribute delimiters', () => {
    const html = renderReportHtml({
      ...report,
      comparisons: [
        { submitted: '', verified: '', sourceUrl: 'https://example.org/path?token=SECRET#private' },
      ],
    });
    expect(html).toContain('href="https://example.org/path"');
    expect(html).not.toContain('SECRET');
    expect(html).not.toContain('#private');
  });
});

describe('approved export HTTP boundary', () => {
  let directory: string;
  let get: (typeof import('../apps/web/app/api/cases/[id]/export/route.ts'))['GET'];
  let getReport: (typeof import('../apps/web/app/api/cases/[id]/report/route.ts'))['GET'];
  beforeEach(async () => {
    vi.resetModules();
    directory = await mkdtemp(join(tmpdir(), 'verifyfirst-report-'));
    vi.stubEnv('VERIFYFIRST_DATA_DIR', directory);
    get = (await import('../apps/web/app/api/cases/[id]/export/route.ts')).GET;
    getReport = (await import('../apps/web/app/api/cases/[id]/report/route.ts')).GET;
    await mkdir(join(directory, 'cases', id), { recursive: true });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  const request = (format: string) =>
    new Request(`http://localhost:3000/api/cases/${id}/export${format}`, {
      headers: { host: 'localhost:3000' },
    });

  it.each(['', '?format=html'])(
    'denies export before approval even when the raw report exists (%s)',
    async (format) => {
      await writeFile(join(directory, 'cases', id, 'report.json'), JSON.stringify(report));
      const response = await get(request(format), { params: Promise.resolve({ id }) });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain(report.summary);
    },
  );

  it('serves only the approved redacted artifact as HTML and leaves machine-readable JSON intact', async () => {
    await writeFile(
      join(directory, 'cases', id, 'report.json'),
      JSON.stringify({ ...report, summary: 'RAW_PRIVATE_SENTINEL' }),
    );
    const approved = JSON.stringify({ ...report, summary: '[email redacted]' });
    await writeFile(join(directory, 'cases', id, 'export.json'), approved);
    const context = { params: Promise.resolve({ id }) };
    const html = await get(request('?format=html'), context);
    expect(html.status).toBe(200);
    expect(html.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(html.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(html.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(html.headers.get('Cache-Control')).toBe('no-store');
    const body = await html.text();
    expect(body).toContain('[email redacted]');
    expect(body).not.toContain('RAW_PRIVATE_SENTINEL');
    const json = await get(request(''), context);
    expect(json.status).toBe(200);
    expect(json.headers.get('Content-Disposition')).toContain('.json');
    expect(await json.text()).toBe(approved);
  });

  it('keeps the separate report document behind the same export gate and request guards', async () => {
    const reportRequest = (headers = { host: 'localhost:3000' }) =>
      new Request(`http://localhost:3000/api/cases/${id}/report`, { headers });
    const context = { params: Promise.resolve({ id }) };
    await writeFile(join(directory, 'cases', id, 'report.json'), JSON.stringify(report));
    expect((await getReport(reportRequest(), context)).status).toBe(403);
    await writeFile(join(directory, 'cases', id, 'export.json'), JSON.stringify(report));
    const response = await getReport(reportRequest(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    expect(await response.text()).toContain('Investigation findings');
    expect((await getReport(reportRequest({ host: 'attacker.example' }), context)).status).toBe(
      403,
    );
  });
});
