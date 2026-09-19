import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Check, CircleHelp, ExternalLink, ShieldAlert } from 'lucide-react';
import type { CaseReport, CaseView, Evidence } from '../../../../agent/types';
import { formatElapsed } from './input-helpers';
import { evidenceLabel } from '../../../../agent/evidence';
import { summarizeReport } from './report-summary';

const tabs = ['Summary', 'Evidence', 'Identity', 'Technical', 'Activity'] as const;
type Tab = (typeof tabs)[number];
const riskLabels: Record<CaseReport['risk'], string> = {
  HIGH_RISK: 'High risk',
  SUSPICIOUS: 'Suspicious',
  LOW_EVIDENCE: 'Limited evidence',
  UNKNOWN: 'Unknown',
};

function SourceLink({ url }: { url?: string }) {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    return null;
  return (
    <a className="source-link" href={parsed.href} target="_blank" rel="noopener noreferrer">
      {parsed.hostname}
      <ExternalLink size={12} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function EvidenceList({ evidence, empty }: { evidence: Evidence[]; empty: string }) {
  if (!evidence.length) return <p className="panel-empty">{empty}</p>;
  return (
    <ol className="evidence-list">
      {evidence.map((item, index) => (
        <li className={`evidence-item evidence-${item.kind}`} key={item.id}>
          <span className="evidence-marker" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="evidence-body">
            <span className="evidence-kind">{evidenceLabel(item)}</span>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
            <SourceLink url={item.sourceUrl} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function InvestigationDashboard({
  caseView,
  report,
}: {
  caseView: CaseView;
  report: CaseReport;
}) {
  const [tab, setTab] = useState<Tab>('Summary');
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const summary = summarizeReport(report);
  const switchTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    setTab(tabs[next] ?? 'Summary');
    buttons.current[next]?.focus();
  };
  return (
    <>
      <div className={`verdict verdict-${report.risk.toLowerCase()}`}>
        <div className="verdict-top">
          <span className="eyebrow">Evidence assessment</span>
          <span className="risk-label">
            <ShieldAlert size={15} aria-hidden="true" />
            {riskLabels[report.risk]}
          </span>
        </div>
        <h2>
          {report.risk === 'HIGH_RISK'
            ? 'Pause before you proceed.'
            : report.risk === 'SUSPICIOUS'
              ? 'There are reasons to be cautious.'
              : 'Keep the uncertainty in view.'}
        </h2>
        <p>{report.summary}</p>
        <div className="report-metrics">
          <span>
            <strong>{summary.meaningfulCount}</strong> evidence signals
          </span>
          <span>
            <strong>{summary.unknownCount}</strong> unknowns
          </span>
        </div>
        <p className="metric-explanation">
          Recorded facts and suspicious signals, not a confidence score.
        </p>
      </div>
      {report.safeNextActions[0] && (
        <div className="recommended-action">
          <Check size={18} aria-hidden="true" />
          <div>
            <span className="eyebrow">Recommended safe action</span>
            <p>{report.safeNextActions[0]}</p>
          </div>
        </div>
      )}
      {summary.contradictions.length > 0 && (
        <section className="contradictions" aria-labelledby="contradictions-title">
          <h3 id="contradictions-title">Key contradictions</h3>
          <ul>
            {summary.contradictions.slice(0, 3).map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </li>
            ))}
          </ul>
          {summary.contradictions.length > 3 && <p>See Identity for all recorded comparisons.</p>}
        </section>
      )}
      <div className="investigation-tabs" role="tablist" aria-label="Investigation details">
        {tabs.map((name, index) => (
          <button
            key={name}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${name.toLowerCase()}`}
            aria-controls={`panel-${name.toLowerCase()}`}
            aria-selected={tab === name}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(event) => switchTab(event, index)}
          >
            {name}
          </button>
        ))}
      </div>
      {tabs.map((name) => (
        <div
          key={name}
          id={`panel-${name.toLowerCase()}`}
          role="tabpanel"
          aria-labelledby={`tab-${name.toLowerCase()}`}
          hidden={tab !== name}
          tabIndex={0}
          className="investigation-panel"
        >
          {name === 'Summary' && (
            <>
              <h3>What was checked</h3>
              <p className="panel-description">
                Observations show what the tools recorded. They do not authenticate the sender.
              </p>
              <dl className="check-grid">
                {summary.checks.map((check) => (
                  <div key={check.label} className={`check-status check-${check.tone}`}>
                    <dt>{check.label}</dt>
                    <dd>{check.status}</dd>
                  </div>
                ))}
                <div
                  className={`check-status check-${report.injectionDetected ? 'caution' : 'unknown'}`}
                >
                  <dt>Prompt-injection detection</dt>
                  <dd>
                    {report.injectionDetected
                      ? 'Instructions detected'
                      : 'None detected by available checks'}
                  </dd>
                </div>
              </dl>
              {report.injectionDetected && (
                <div className="injection-warning">
                  <ShieldAlert size={19} aria-hidden="true" />
                  <div>
                    <strong>Instructions hidden in the submitted content</strong>
                    <p>
                      Agent-directed instructions were treated as untrusted evidence. They do not
                      override investigation policy.
                    </p>
                  </div>
                </div>
              )}
              <section className="report-section" aria-labelledby="next-actions-title">
                <h3 id="next-actions-title">Your safest next steps</h3>
                <ul className="safe-actions">
                  {report.safeNextActions.map((action, index) => (
                    <li key={index}>
                      <Check size={16} aria-hidden="true" />
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </section>
              {report.limitations.length > 0 && (
                <details className="limitations">
                  <summary>
                    <CircleHelp size={15} aria-hidden="true" />
                    What this investigation cannot establish
                  </summary>
                  <ul>
                    {report.limitations.map((limitation, index) => (
                      <li key={index}>{limitation}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {name === 'Evidence' && (
            <>
              <div className="section-heading">
                <h3>The evidence trail</h3>
                <span className="count-label">{summary.evidence.length} observations</span>
              </div>
              <p className="panel-description">
                Source observations are separate from the overall model assessment above.
              </p>
              <EvidenceList
                evidence={summary.evidence}
                empty="No evidence observations were recorded. This does not establish safety."
              />
            </>
          )}
          {name === 'Identity' && (
            <>
              <h3>Identity and independent references</h3>
              <p className="panel-description">
                Compare the claimed identity with independently sourced records. Reputation is a
                third-party signal, never proof of fraud.
              </p>
              {report.comparisons.length > 0 && (
                <div className="domain-comparisons">
                  {report.comparisons.map((comparison, index) => (
                    <div className="domain-pair" key={index}>
                      <div>
                        <span className="eyebrow">Submitted</span>
                        <code>{comparison.submitted}</code>
                      </div>
                      <ArrowRight size={16} aria-hidden="true" />
                      <div>
                        <span className="eyebrow">Independent reference</span>
                        <code>{comparison.verified}</code>
                        <SourceLink url={comparison.sourceUrl} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <EvidenceList
                evidence={summary.identity}
                empty="No sender or organization observations were recorded. Identity remains unverified."
              />
            </>
          )}
          {name === 'Technical' && (
            <>
              <h3>Domain, URL and mail checks</h3>
              <p className="panel-description">
                DNS, redirects, registration data and email policy records are inspection results,
                not guarantees of safety.
              </p>
              <EvidenceList
                evidence={summary.technical}
                empty="No technical observations were recorded for this case."
              />
            </>
          )}
          {name === 'Activity' && <InvestigationActivity caseView={caseView} />}
        </div>
      ))}
    </>
  );
}

export function InvestigationActivity({ caseView }: { caseView: CaseView }) {
  return (
    <section className="activity-section" aria-labelledby="activity-title">
      <div className="section-heading">
        <h3 id="activity-title">Investigation activity</h3>
        <span className="count-label">TRUEFORGE</span>
      </div>
      <ol className="activity-list">
        {caseView.activity.map((activity) => (
          <li
            key={activity.id}
            className={`activity-${activity.type.includes('approval') ? 'approval' : activity.type.startsWith('thread.') ? 'subagent' : (activity.toolKind ?? 'harness')}`}
          >
            <span className="activity-dot" aria-hidden="true" />
            <div>
              <span className="activity-kind">
                {activity.type.includes('approval')
                  ? 'Approval'
                  : activity.type.startsWith('thread.')
                    ? 'TrueForge subagent'
                    : activity.label.toLowerCase().includes('sandbox') ||
                        activity.toolName?.includes('exec')
                      ? 'Sandbox'
                      : activity.toolKind === 'mcp'
                        ? 'MCP tool'
                        : 'TrueForge'}
                {activity.type.includes('response')
                  ? activity.success === false
                    ? ' · Failed result'
                    : ' · Result'
                  : activity.type === 'model.message' && Boolean(activity.toolName)
                    ? ' · Call'
                    : ''}
              </span>
              <strong>{activity.label}</strong>
              <p>{activity.detail}</p>
            </div>
            <time dateTime={activity.timestamp}>
              {new Date(activity.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
              {activity.durationMs !== undefined && (
                <span className="activity-duration">
                  {' '}
                  · {formatElapsed(activity.durationMs)} elapsed
                </span>
              )}
            </time>
          </li>
        ))}
      </ol>
      <details className="session-details">
        <summary>Session details</summary>
        <dl>
          <div>
            <dt>Case</dt>
            <dd>{caseView.id}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>{caseView.sessionId || 'Starting…'}</dd>
          </div>
          <div>
            <dt>Turn</dt>
            <dd>{caseView.turnId || 'Starting…'}</dd>
          </div>
          <div>
            <dt>Sandbox executed</dt>
            <dd>{caseView.sandboxExecuted ? 'Yes' : 'No'}</dd>
          </div>
        </dl>
      </details>
    </section>
  );
}
