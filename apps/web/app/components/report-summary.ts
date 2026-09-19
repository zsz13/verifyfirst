import type { CaseReport, Evidence } from '../../../../agent/types';

export interface InvestigationCheck {
  label: string;
  status: 'Signals found' | 'Observations available' | 'Limited evidence' | 'Not recorded';
  tone: 'caution' | 'observed' | 'unknown';
  evidence: Evidence[];
}

function check(label: string, evidence: Evidence[]): InvestigationCheck {
  return {
    label,
    evidence,
    status: evidence.some((item) => item.kind === 'suspicious_signal')
      ? 'Signals found'
      : evidence.some((item) => item.kind === 'verified_fact')
        ? 'Observations available'
        : evidence.length
          ? 'Limited evidence'
          : 'Not recorded',
    tone: evidence.some((item) => item.kind === 'suspicious_signal')
      ? 'caution'
      : evidence.some((item) => item.kind === 'verified_fact')
        ? 'observed'
        : 'unknown',
  };
}

/** Group recorded observations; absence is never converted into a successful check. */
export function summarizeReport(report: CaseReport) {
  const evidence = [...new Map(report.evidence.map((item) => [item.id, item])).values()];
  const identity = evidence.filter((item) =>
    ['inspect_sender', 'verify_organization'].includes(item.tool),
  );
  const technical = evidence.filter(
    (item) =>
      ['inspect_domain', 'inspect_url'].includes(item.tool) ||
      (item.tool === 'inspect_sender' && /SPF|DMARC|MX|DNS/.test(item.title)),
  );
  const contradictionPairs = new Set<string>();
  const contradictions = evidence.filter((item) => {
    if (
      item.kind !== 'suspicious_signal' ||
      !/mismatch|contradiction|differs|does not match/i.test(item.title)
    )
      return false;
    const pair = report.comparisons.find(
      (comparison) =>
        item.detail.includes(comparison.submitted) && item.detail.includes(comparison.verified),
    );
    const key = pair ? JSON.stringify([pair.submitted, pair.verified]) : item.id;
    if (contradictionPairs.has(key)) return false;
    contradictionPairs.add(key);
    return true;
  });
  return {
    evidence,
    meaningfulCount: evidence.filter((item) => item.kind !== 'unknown').length,
    unknownCount: evidence.filter((item) => item.kind === 'unknown').length,
    contradictions,
    identity,
    technical,
    checks: [
      check(
        'Message / content',
        evidence.filter((item) => item.tool === 'analyze_submission'),
      ),
      check(
        'Phone reputation',
        evidence.filter(
          (item) =>
            item.tool === 'inspect_sender' && /IPQS|IPQualityScore|reputation/i.test(item.title),
        ),
      ),
      check(
        'Email / mail records',
        evidence.filter(
          (item) => item.tool === 'inspect_sender' && /email|SPF|DMARC|MX/i.test(item.title),
        ),
      ),
      check(
        'URL / domain',
        evidence.filter((item) => ['inspect_domain', 'inspect_url'].includes(item.tool)),
      ),
      check(
        'Claimed organization',
        evidence.filter((item) => item.tool === 'verify_organization'),
      ),
      check(
        'External trusted sources',
        evidence.filter((item) => item.tool === 'search_trusted_sources'),
      ),
    ],
  };
}
