import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderReportHtml } from '../agent/report-html.ts';
import type { CaseReport } from '../agent/types.ts';
import { parseSender } from '../apps/mcp/src/sender.ts';
import { analyzeText } from '../apps/mcp/src/analysis.ts';
import {
  analyzeSubmission,
  createCaseReport,
  executeTool,
  inspectSender,
  inspectUrl,
  verifyOrganization,
} from '../apps/mcp/src/tools.ts';
import {
  caseDir,
  exportCaseReport,
  readEvidence,
  readJson,
  record,
  saveJson,
} from '../apps/mcp/src/store.ts';

const { resolve4, resolve6, resolveMx, resolveTxt, fetchPage } = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveMx: vi.fn(),
  resolveTxt: vi.fn(),
  fetchPage: vi.fn(),
}));
vi.mock('node:dns/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:dns/promises')>()),
  Resolver: class {
    resolve4 = resolve4;
    resolve6 = resolve6;
    resolveMx = resolveMx;
    resolveTxt = resolveTxt;
  },
}));
vi.mock('../apps/mcp/src/network.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../apps/mcp/src/network.ts')>()),
  safeFetch: fetchPage,
}));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'verifyfirst-sender-'));
  vi.stubEnv('VERIFYFIRST_DATA_DIR', directory);
  vi.stubEnv('IPQS_API_KEY', '');
  vi.stubEnv('IPQS_API_KEY_FILE', '');
  resolve4.mockReset().mockResolvedValue(['93.184.216.34']);
  resolve6.mockReset().mockResolvedValue([]);
  resolveMx.mockReset().mockResolvedValue([{ priority: 10, exchange: 'mail.example.com' }]);
  resolveTxt.mockReset().mockResolvedValue([]);
  fetchPage.mockReset().mockRejectedValue(new Error('Offline RDAP fixture'));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(directory, { recursive: true, force: true });
});
async function original(sender: string, text = '') {
  const caseId = randomUUID();
  await saveJson(caseId, 'submission.json', { sender, text });
  await analyzeSubmission({ caseId, text: 'Model-substituted content is not authoritative.' });
  return caseId;
}
describe('sender input boundaries', () => {
  it('normalizes an explicit international phone number without inventing its identity', () => {
    expect(parseSender('+1 (202) 555-0147')).toMatchObject({
      kind: 'phone',
      e164: '+12025550147',
      country: 'US',
      numberType: 'FIXED_LINE_OR_MOBILE',
    });
    expect(parseSender('202-555-0147')).toMatchObject({ kind: 'unknown' });
    expect(parseSender('+123')).toMatchObject({ kind: 'unknown' });
    expect(parseSender('+1 202 555 0147 ext 42')).toMatchObject({ kind: 'unknown' });
  });
  it('normalizes internationalized email hostnames without retaining mailbox names', () => {
    expect(parseSender('Example@BÜCHER.de')).toEqual({ kind: 'email', domain: 'xn--bcher-kva.de' });
    expect(analyzeText('Chase sent this.', '', 'test@chase-alert.example').domains).toContain(
      'chase-alert.example',
    );
  });
  it.each([
    'a@localhost',
    'a@127.0.0.1',
    'a@metadata.internal',
    'a@[::1]',
    'a@example.com/path',
    'a@example.com:443',
    'a@-example.com',
    'a@@example.com',
    'a\r\n@example.com',
    'Display Name <a@example.com>',
  ])('does not issue DNS requests for ineligible sender %s', async (sender) => {
    const result = await inspectSender({ caseId: await original(sender) });
    expect(result.sender.kind).toBe('unknown');
    expect(resolve4).not.toHaveBeenCalled();
    expect(resolveTxt).not.toHaveBeenCalled();
    expect(result.evidence.every((entry) => entry.kind === 'unknown')).toBe(true);
  });
  it('reads only the original case sender and rejects a model-supplied replacement', async () => {
    const caseId = await original('+1 202 555 0147');
    await expect(
      executeTool('inspect_sender', { caseId, sender: 'fake@chase.com' }),
    ).rejects.toThrow();
    const result = await inspectSender({ caseId });
    expect(result.sender.kind).toBe('phone');
    expect(
      result.evidence.some((entry) => entry.title === 'Phone ownership and reputation unverified'),
    ).toBe(true);
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
describe('sender evidence interpretation', () => {
  it('records MX, SPF and DMARC presence without treating DNS as message authentication', async () => {
    resolveTxt.mockImplementation((host: string) =>
      Promise.resolve([host.startsWith('_dmarc.') ? ['v=DMARC1;', ' p=reject'] : ['v=spf1 -all']]),
    );
    const result = await inspectSender({ caseId: await original('private-mailbox@example.com') });
    expect(result.evidence.some((entry) => entry.detail.includes('MX=mail.example.com'))).toBe(
      true,
    );
    for (const label of ['SPF', 'DMARC']) {
      expect(
        result.evidence.find((entry) => entry.title === `${label} DNS presence observation`),
      ).toMatchObject({ kind: 'verified_fact' });
    }
    expect(JSON.stringify(result)).not.toContain('private-mailbox');
    expect(JSON.stringify(result)).toContain('does not prove');
  });
  it('keeps DNS failures unknown and absent authentication records non-accusatory', async () => {
    resolveTxt.mockRejectedValueOnce(Object.assign(new Error('No data'), { code: 'ENODATA' }));
    resolveTxt.mockRejectedValueOnce(Object.assign(new Error('Timeout'), { code: 'ETIMEOUT' }));
    const caseId = await original('test@example.com');
    const result = await inspectSender({ caseId });
    const spf = result.evidence.find((entry) => entry.title === 'SPF DNS presence observation');
    expect(spf?.kind).toBe('verified_fact');
    expect(spf?.detail).toContain('0 matching record');
    expect(
      result.evidence.find((entry) => entry.title === 'DMARC DNS presence observation'),
    ).toMatchObject({ kind: 'unknown' });
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    expect((await createCaseReport({ caseId })).report.risk).toBe('LOW_EVIDENCE');
  });
  it('compares the original sender with an independent organization domain and requires inspection', async () => {
    const caseId = await original(
      'support@unrelated.example',
      'Chase: Please review your statement.',
    );
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await expect(createCaseReport({ caseId })).rejects.toMatchObject({
      code: 'SENDER_CHECK_REQUIRED',
    });
    const result = await inspectSender({ caseId });
    const mismatch = result.evidence.find(
      (entry) => entry.title === 'Organization domain mismatch',
    );
    expect(mismatch?.kind).toBe('suspicious_signal');
    expect(mismatch?.sourceUrl).toContain('chase.com');
    const report = (await createCaseReport({ caseId })).report;
    expect(report.risk).toBe('SUSPICIOUS');
    expect(report.comparisons).toContainEqual(
      expect.objectContaining({ submitted: 'unrelated.example', verified: 'chase.com' }),
    );
  });
});

describe('multiple-link report coverage', () => {
  it('distinguishes an attempted unavailable inspection from a silently omitted URL', async () => {
    const caseId = randomUUID();
    const text = 'Review https://one.example and https://two.example';
    await saveJson(caseId, 'submission.json', { text });
    await analyzeSubmission({ caseId, text });
    await expect(createCaseReport({ caseId })).rejects.toMatchObject({
      code: 'INDEPENDENT_CHECK_REQUIRED',
    });
    expect((await readEvidence(caseId)).some((entry) => entry.tool === 'create_case_report')).toBe(
      false,
    );
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await inspectUrl({ caseId, url: 'https://one.example' });
    const report = (await createCaseReport({ caseId })).report;
    expect(
      report.evidence.some((entry) => entry.title === 'Submitted link 1 inspection not recorded'),
    ).toBe(false);
    expect(
      report.evidence.find((entry) => entry.title === 'Submitted link 2 inspection not recorded')
        ?.kind,
    ).toBe('unknown');
    const repeated = (await createCaseReport({ caseId })).report;
    expect(
      repeated.evidence.filter(
        (entry) => entry.title === 'Submitted link 2 inspection not recorded',
      ),
    ).toHaveLength(1);
    expect((await readEvidence(caseId)).some((entry) => entry.tool === 'create_case_report')).toBe(
      false,
    );
    await inspectUrl({ caseId, url: 'https://two.example' });
    const complete = (await createCaseReport({ caseId })).report;
    expect(complete.evidence.some((entry) => entry.title.includes('inspection not recorded'))).toBe(
      false,
    );
  });
});

describe('harness URL coverage gate and sender export', () => {
  it('can attempt a long embedded URL accepted by the message input before finalizing', async () => {
    const caseId = randomUUID();
    const url = 'https://example.com/?token=' + 'a'.repeat(4200);
    await saveJson(caseId, 'submission.json', { text: `Check ${url}` });
    await executeTool('analyze_submission', { caseId, text: '' });
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await expect(executeTool('inspect_url', { caseId, url })).resolves.toMatchObject({
      kind: 'url_inspection',
    });
    await expect(executeTool('create_case_report', { caseId })).resolves.toMatchObject({
      kind: 'case_report',
    });
  });
  it('requires all URLs at the MCP report boundary, counting malformed and blocked attempts', async () => {
    const caseId = randomUUID();
    const text = 'Check https://localhost and https://exa%mple.com';
    await saveJson(caseId, 'submission.json', { text });
    await executeTool('analyze_submission', { caseId, text });
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await executeTool('inspect_url', { caseId, url: 'https://localhost' });
    await expect(executeTool('create_case_report', { caseId })).rejects.toMatchObject({
      code: 'URL_CHECK_REQUIRED',
    });
    await executeTool('inspect_url', { caseId, url: 'https://exa%mple.com' });
    await expect(executeTool('create_case_report', { caseId })).resolves.toMatchObject({
      kind: 'case_report',
    });
    await expect(
      executeTool('inspect_url', { caseId, url: 'https://unrelated.example' }),
    ).rejects.toMatchObject({ code: 'UNRELATED_TARGET' });
  });
  it('redacts short valid international phone formats in approved JSON and HTML', async () => {
    const number = '+6834000';
    expect(parseSender(number).kind).toBe('phone');
    const caseId = await original(number);
    await inspectSender({ caseId });
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await createCaseReport({ caseId });
    const bytes = await readFile(join(caseDir(caseId), 'report.json'));
    expect(bytes.toString()).toContain(number);
    await saveJson(caseId, 'export-grant.json', {
      caseId,
      approvedAt: new Date().toISOString(),
      reportHash: createHash('sha256').update(bytes).digest('hex'),
    });
    await exportCaseReport(caseId);
    const exported = await readJson<CaseReport>(caseId, 'export.json');
    expect(exported).toBeDefined();
    expect(JSON.stringify(exported)).not.toContain(number);
    if (!exported) throw new Error('Missing approved export');
    expect(renderReportHtml(exported)).not.toContain(number);
  });
});

describe('unified identity and organization checks', () => {
  it('correlates phone, email, all links and explicit organization in one original case', async () => {
    const caseId = randomUUID();
    await saveJson(caseId, 'submission.json', {
      text: 'Urgent: transfer money now. https://first.example https://second.example',
      senderPhone: '+1 202 555 0147',
      senderEmail: 'private@sender.example',
      claimedOrganization: 'Chase',
    });
    const analysis = await analyzeSubmission({ caseId, text: '' });
    expect(analysis.organizations).toContain('Chase');
    expect(analysis.domains).toEqual(
      expect.arrayContaining(['first.example', 'second.example', 'sender.example']),
    );
    vi.stubEnv('IPQS_API_KEY', 'unit-test-credential');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ success: true, fraud_score: 0, risky: false })),
        ),
    );
    const result = await inspectSender({ caseId });
    expect(result.senders.map((sender) => sender.kind)).toEqual(['phone', 'email']);
    expect(result.evidence.some((item) => item.title === 'IPQS third-party phone reputation')).toBe(
      true,
    );
    await verifyOrganization({ caseId, organization: 'Chase' });
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    const report = (await createCaseReport({ caseId })).report;
    expect(report.comparisons.map((item) => item.submitted)).toEqual(
      expect.arrayContaining(['first.example', 'second.example', 'sender.example']),
    );
    expect(report.risk).toBe('HIGH_RISK');
    expect(JSON.stringify(result)).not.toContain('private@');
  });
  it('never promotes phone reputation alone to HIGH_RISK and survives provider failure', async () => {
    vi.stubEnv('IPQS_API_KEY', 'unit-test-credential');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ success: true, fraud_score: 100, risky: true, spammer: true }),
          ),
        )
        .mockRejectedValueOnce(new Error('provider unavailable')),
    );
    for (const expected of ['SUSPICIOUS', 'UNKNOWN']) {
      const caseId = await original('+12025550147');
      await inspectSender({ caseId });
      await record(
        caseId,
        'search_trusted_sources',
        'unknown',
        'Source unavailable',
        'No conclusion.',
      );
      expect((await createCaseReport({ caseId })).report.risk).toBe(expected);
    }
  });
  it('requires every identity check to finish, even if partial sender evidence exists', async () => {
    const caseId = await original('+12025550147');
    await record(
      caseId,
      'inspect_sender',
      'verified_fact',
      'Phone numbering-plan observation',
      'Partial check only',
    );
    await record(
      caseId,
      'search_trusted_sources',
      'unknown',
      'Source unavailable',
      'No conclusion.',
    );
    await expect(createCaseReport({ caseId })).rejects.toMatchObject({
      code: 'SENDER_CHECK_REQUIRED',
    });
  });
});

it('presents readable low-risk IPQS observations while preserving phone-only uncertainty', async () => {
  vi.stubEnv('IPQS_API_KEY', 'unit-test-credential');
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          fraud_score: 0,
          valid: true,
          recent_abuse: false,
          active: null,
        }),
      ),
    ),
  );
  const caseId = await original('+12025550147');
  const result = await inspectSender({ caseId });
  const observation = result.evidence.find(
    (item) => item.title === 'IPQS third-party phone reputation',
  );
  expect(observation?.detail).toContain('Fraud score: 0/100; Valid: yes; Active: unknown');
  expect(observation?.detail).toContain('Recent abuse: no');
  expect(result.phoneReputations).toContainEqual(
    expect.objectContaining({
      status: 'available',
      signals: { fraud_score: 0, valid: true, recent_abuse: false, active: null },
    }),
  );
  await record(caseId, 'search_trusted_sources', 'unknown', 'Source unavailable', 'No conclusion.');
  const report = (await createCaseReport({ caseId })).report;
  expect(report.risk).toBe('LOW_EVIDENCE');
  expect(report.limitations).not.toContain('No independent external facts were retrieved.');
  expect(report.summary).toContain('not enough evidence to authenticate the sender');
});

it('does not manufacture contradictions between co-mentioned official organizations', async () => {
  const caseId = randomUUID();
  const text =
    'Chase and PayPal security information: https://www.chase.com and https://www.paypal.com';
  await saveJson(caseId, 'submission.json', { text, senderEmail: 'support@paypal.com' });
  await analyzeSubmission({ caseId, text });
  await inspectSender({ caseId });
  for (const organization of ['Chase', 'PayPal']) {
    const result = await verifyOrganization({ caseId, organization });
    expect(result).toMatchObject({ matched: true, allMatched: true });
    expect(result.evidence.some((item) => item.title === 'Organization domain mismatch')).toBe(
      false,
    );
  }
  await record(caseId, 'search_trusted_sources', 'unknown', 'Source unavailable', 'No conclusion.');
  const report = (await createCaseReport({ caseId })).report;
  expect(report.risk).toBe('LOW_EVIDENCE');
  expect(report.evidence.some((item) => item.title === 'Organization domain mismatch')).toBe(false);
  expect(report.comparisons.every((item) => item.submitted.endsWith(item.verified))).toBe(true);
});

it('keeps unexpected links visible and returns selected versus aggregate match honestly', async () => {
  const caseId = randomUUID();
  const text = 'Chase information: https://unexpected.example https://www.chase.com';
  await saveJson(caseId, 'submission.json', { text });
  await analyzeSubmission({ caseId, text });
  const result = await verifyOrganization({
    caseId,
    organization: 'Chase',
    submittedDomain: 'www.chase.com',
  });
  expect(result).toMatchObject({ matched: true, allMatched: false });
  const mismatch = result.evidence.find((item) => item.title === 'Organization domain mismatch');
  expect(mismatch?.detail).toContain('unexpected.example');
  expect(mismatch?.detail).toContain('relationship to the organization remains unverified');
  expect(await verifyOrganization({ caseId, organization: 'Chase' })).toMatchObject({
    matched: false,
    allMatched: false,
  });
});
