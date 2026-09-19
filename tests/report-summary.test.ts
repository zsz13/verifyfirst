import { describe, expect, it } from 'vitest';
import type { CaseReport, Evidence } from '../agent/types';
import { evidenceLabel } from '../agent/evidence';
import { summarizeReport } from '../apps/web/app/components/report-summary';

function report(evidence: Evidence[]): CaseReport {
  return {
    caseId: '00000000-0000-4000-8000-000000000000',
    risk: 'UNKNOWN',
    summary: 'Uncertain',
    evidence,
    comparisons: [],
    injectionDetected: false,
    safeNextActions: [],
    limitations: [],
    createdAt: '2026-01-01T00:00:00Z',
  };
}
function observation(id: string, tool: string, kind: Evidence['kind'], title: string): Evidence {
  return {
    id,
    tool,
    kind,
    title,
    detail: 'Recorded source observation',
    observedAt: '2026-01-01T00:00:00Z',
  };
}

describe('investigation dashboard evidence summaries', () => {
  it('counts distinct recorded facts and signals without counting unknowns as evidence strength', () => {
    const fact = observation('one', 'inspect_url', 'verified_fact', 'HTTP response observed');
    const result = summarizeReport(
      report([fact, fact, observation('two', 'inspect_domain', 'unknown', 'RDAP unavailable')]),
    );
    expect(result.meaningfulCount).toBe(1);
    expect(result.unknownCount).toBe(1);
    expect(result.evidence).toHaveLength(2);
  });
  it('keeps failed and absent phone reputation checks distinct from observed results', () => {
    const empty = summarizeReport(report([]));
    expect(empty.checks.find((item) => item.label === 'Phone reputation')?.status).toBe(
      'Not recorded',
    );
    const failed = summarizeReport(
      report([observation('ipqs', 'inspect_sender', 'unknown', 'IPQS reputation unavailable')]),
    );
    expect(failed.checks.find((item) => item.label === 'Phone reputation')?.status).toBe(
      'Limited evidence',
    );
    const observed = summarizeReport(
      report([
        observation('ipqs', 'inspect_sender', 'verified_fact', 'IPQS third-party phone reputation'),
      ]),
    );
    expect(observed.checks.find((item) => item.label === 'Phone reputation')?.status).toBe(
      'Observations available',
    );
  });
  it('highlights recorded contradictions without inventing them from unequal display strings', () => {
    const data = report([
      observation(
        'mismatch',
        'verify_organization',
        'suspicious_signal',
        'Organization domain mismatch',
      ),
      observation('match', 'verify_organization', 'verified_fact', 'Submitted domain matches'),
      observation('unknown', 'verify_organization', 'unknown', 'Mismatch check unavailable'),
    ]);
    data.comparisons = [{ submitted: 'www.chase.com', verified: 'chase.com' }];
    const result = summarizeReport(data);
    expect(result.contradictions.map((item) => item.id)).toEqual(['mismatch']);
    expect(result.checks.find((item) => item.label === 'Claimed organization')?.status).toBe(
      'Signals found',
    );
  });
  it('collapses equivalent contradiction pairs only in the summary, preserving source evidence', () => {
    const first = {
      ...observation(
        'sender',
        'inspect_sender',
        'suspicious_signal',
        'Organization domain mismatch',
      ),
      detail: 'Sender uses chase-check.example; official chase.com.',
    };
    const second = {
      ...first,
      id: 'url',
      tool: 'verify_organization',
      detail: 'Chase: submitted chase-check.example; independent chase.com.',
    };
    const data = report([first, second]);
    data.comparisons = [{ submitted: 'chase-check.example', verified: 'chase.com' }];
    const result = summarizeReport(data);
    expect(result.contradictions).toHaveLength(1);
    expect(result.evidence).toHaveLength(2);
  });
  it('labels third-party observations without implying caller authentication', () => {
    const provider = {
      ...observation(
        'ipqs',
        'inspect_sender',
        'verified_fact',
        'IPQS third-party phone reputation',
      ),
      provenance: 'third_party' as const,
    };
    expect(evidenceLabel(provider)).toBe('Provider observation');
    expect(evidenceLabel({ ...provider, kind: 'suspicious_signal' })).toBe('Third-party signal');
    expect(evidenceLabel(observation('dns', 'inspect_domain', 'verified_fact', 'DNS answer'))).toBe(
      'Verified fact',
    );
  });
  it('keeps mail-policy observations in identity and technical views without claiming authentication', () => {
    const data = report([
      observation('spf', 'inspect_sender', 'verified_fact', 'SPF DNS presence observation'),
      observation('domain', 'inspect_domain', 'unknown', 'RDAP unavailable'),
    ]);
    const result = summarizeReport(data);
    expect(result.identity.map((item) => item.id)).toEqual(['spf']);
    expect(result.technical.map((item) => item.id)).toEqual(['spf', 'domain']);
    expect(result.checks.find((item) => item.label === 'Email / mail records')?.status).toBe(
      'Observations available',
    );
  });
});
