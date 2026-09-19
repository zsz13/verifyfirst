import type { CaseReport } from './types.ts';

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] || character;
  });
}

function source(value?: string): string {
  if (!value) return '<span class="muted">No external source recorded</span>';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return '<span class="muted">Source link omitted: unsupported or credential-bearing URL</span>';
    url.search = '';
    url.hash = '';
    return `<a href="${escape(url.href)}" rel="noopener noreferrer nofollow" referrerpolicy="no-referrer">${escape(url.href)}</a>`;
  } catch {
    return '<span class="muted">Source link unavailable</span>';
  }
}

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf())
    ? escape(
        parsed
          .toISOString()
          .replace('T', ' ')
          .replace(/\.\d{3}Z$/, ' UTC'),
      )
    : 'Time not recorded';
}

const labels = {
  verified_fact: 'Verified fact',
  suspicious_signal: 'Suspicious signal',
  unknown: 'Unknown',
};

/** Only render the already approved, redacted export artifact, never raw case input. */
export function renderReportHtml(report: CaseReport): string {
  const risk = report.risk.replaceAll('_', ' ');
  const list = (items: string[]) => items.map((item) => `<li>${escape(item)}</li>`).join('');
  const evidence = report.evidence
    .map(
      (item, index) => `<article class="evidence">
        <div class="eyebrow"><span class="badge ${item.kind}">${labels[item.kind]}</span><span>Evidence ${index + 1}</span></div>
        <h3>${escape(item.title)}</h3><p>${escape(item.detail)}</p>
        <p class="source">${source(item.sourceUrl)}</p>
        <p class="muted metadata">${escape(item.tool)} · ${date(item.observedAt)}</p>
      </article>`,
    )
    .join('');
  const comparisons = report.comparisons
    .map(
      (
        item,
      ) => `<div class="comparison"><div><h3>Submitted information</h3><p>${escape(item.submitted)}</p></div>
        <div><h3>Independent check</h3><p>${escape(item.verified)}</p><p class="source">${source(item.sourceUrl)}</p></div></div>`,
    )
    .join('');
  const timeline = [...report.evidence]
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
    .map(
      (item) =>
        `<li><time>${date(item.observedAt)}</time><div><strong>${escape(item.title)}</strong><span class="muted">${escape(item.tool)} · ${labels[item.kind]}</span></div></li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><title>VerifyFirst — Evidence report · ${escape(report.caseId)}</title>
<style>
:root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #17252c; background: #f0f4f3; }
* { box-sizing: border-box; } body { margin: 0; line-height: 1.6; font-size: 15px; }
.print-note { max-width: 920px; margin: 24px auto 16px; padding: 0 28px; color: #465a60; font-size: 13px; }
main { max-width: 920px; margin: 0 auto 32px; padding: 48px; background: #fff; border: 1px solid #dce5e2; border-radius: 16px; }
.brand { display: flex; align-items: center; gap: 11px; font-size: 23px; font-weight: 750; letter-spacing: -.7px; }
.brand svg { width: 34px; height: 34px; flex: none; }.brand small { font-size: 11px; letter-spacing: 1.4px; margin-left: auto; color: #526660; text-transform: uppercase; }
h1 { font-size: 34px; line-height: 1.15; letter-spacing: -1px; margin: 30px 0 12px; } h2 { font-size: 19px; letter-spacing: -.3px; margin: 0 0 14px; } h3 { font-size: 15px; line-height: 1.45; margin: 12px 0 6px; }
p { margin: 0 0 10px; overflow-wrap: anywhere; } section { margin-top: 30px; } .muted { color: #526660; }.metadata { font-size: 12px; } .case-id { overflow-wrap: anywhere; }
.assessment { margin-top: 28px; padding: 23px; border: 1px solid #dbe5e1; border-left: 4px solid #356957; border-radius: 8px; background: #f7faf8; }
.risk { font-size: 12px; font-weight: 800; letter-spacing: 1.1px; display: inline-block; margin-bottom: 10px; }.risk-HIGH_RISK { color: #9e2927; }.risk-SUSPICIOUS { color: #81500b; }.risk-LOW_EVIDENCE, .risk-UNKNOWN { color: #40576a; }
.eyebrow { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; font-size: 11px; color: #526660; }.badge { padding: 3px 7px; border-radius: 4px; font-weight: 650; }.verified_fact { background: #e9f2ed; color: #24583f; }.suspicious_signal { background: #fbefdf; color: #805010; }.unknown { background: #edf0f5; color: #4a5770; }
.evidence { padding: 18px 0; border-top: 1px solid #e2e9e6; break-inside: avoid; }.source { font-size: 12px; overflow-wrap: anywhere; }.source a { color: #205b51; text-decoration-thickness: 1px; text-underline-offset: 3px; }.comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; padding: 14px 0; border-top: 1px solid #e2e9e6; break-inside: avoid; }.comparison h3 { color: #526660; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
.notice { border-left: 3px solid #b0752b; padding: 10px 14px; background: #fff8ed; margin-top: 16px; font-size: 13px; } ul, ol { padding-left: 23px; } li { margin: 8px 0; overflow-wrap: anywhere; }
.timeline { list-style: none; padding: 0; }.timeline li { display: grid; grid-template-columns: 190px 1fr; gap: 14px; border-top: 1px solid #e2e9e6; padding: 12px 0; margin: 0; font-size: 12px; break-inside: avoid; }.timeline time { color: #526660; font-variant-numeric: tabular-nums; }.timeline span { display: block; }
footer { margin-top: 32px; padding-top: 18px; border-top: 1px solid #dce5e2; font-size: 11px; color: #526660; }.privacy { font-size: 12px; }
@media (max-width: 620px) { main { border-radius: 0; padding: 25px 20px; border-left: 0; border-right: 0; }.print-note { padding: 0 20px; }.brand small { display: none; }h1 { font-size: 29px; }.comparison, .timeline li { grid-template-columns: 1fr; gap: 4px; }.assessment { padding: 18px; } }
@media print { @page { size: auto; margin: 16mm; }:root, body { background: #fff; font-size: 10pt; }.print-note { display: none; }main { border: 0; border-radius: 0; margin: 0; padding: 0; max-width: none; }h1 { font-size: 25pt; }h2 { break-after: avoid; }h3 { break-after: avoid; }section { margin-top: 22px; }a { color: #17252c; }.assessment { break-inside: avoid; background: #fff; }.brand small { display: inline; }.comparison { grid-template-columns: 1fr 1fr; }.timeline li { grid-template-columns: 165px 1fr; } }
</style></head><body>
<p class="print-note">Print-ready report · Use your browser’s Print menu (Ctrl+P or ⌘P) to print or save as PDF. Review before sharing; redaction is best effort.</p>
<main><header><div class="brand"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#28523e"/><path d="M8 12V8h12M8 18v6h6" stroke="#a6bca2" stroke-width="2" stroke-linecap="round"/><path d="m12 16 4 4 8-9" stroke="#fffefa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>VerifyFirst<small>Evidence report</small></div>
<h1>Investigation findings</h1><p class="muted metadata">Created ${date(report.createdAt)}</p><p class="muted metadata case-id">Case ${escape(report.caseId)}</p></header>
<div class="assessment"><div class="risk risk-${report.risk}">${risk}</div><h2>Assessment</h2><p>${escape(report.summary)}</p><p class="muted metadata">This assessment is a conclusion from the observations below, not a guarantee of safety. Unknown information remains unknown.</p></div>
${report.injectionDetected ? '<p class="notice"><strong>Embedded instructions detected.</strong> Instructions within the submitted content were treated as untrusted data and did not change the investigation policy.</p>' : ''}
<section><h2>Evidence &amp; sources</h2><p class="muted metadata">Verified facts describe tool observations. Suspicious signals warrant caution. Unknowns identify checks that could not establish a fact. A source link alone is not an endorsement.</p>${evidence || '<p class="muted">No evidence was recorded.</p>'}</section>
<section><h2>Checked entities</h2>${comparisons || '<p class="muted">No independently verified entity comparison was established.</p>'}</section>
<section><h2>Recommended safe actions</h2><ol>${list(report.safeNextActions)}</ol></section>
<section><h2>Evidence timeline</h2><p class="muted metadata">Recorded observation times, shown in UTC. These are evidence timestamps, not execution durations. Full TrueForge execution traces remain in the local investigation.</p><ol class="timeline">${timeline || '<li>No observation times recorded.</li>'}</ol></section>
<section><h2>Limitations</h2><ul>${list(report.limitations)}</ul><p class="privacy muted">Export was explicitly approved through TrueForge. This document uses the same redacted evidence as the JSON export. Common phone numbers, email addresses and URL query strings are removed; redaction may not catch every personal detail. Inspect the document before sharing. No message, payment or external report is sent by this export.</p></section>
<footer>VerifyFirst · Team XXI · Powered by TrueForge<br>Evidence-backed scam verification. Source availability and domain information can change after the investigation.</footer>
</main></body></html>`;
}
