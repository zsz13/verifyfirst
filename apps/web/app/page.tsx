'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Fingerprint,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { CaseReport, CaseView, HealthView } from '../../../agent/types';
import { demos } from '../../../fixtures/demos';

const STORAGE_KEY = 'verifyfirst.caseId';
const CASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_UNAVAILABLE =
  'The investigation provider is unavailable. Check your model connection in TrueForge, then try again.';
const riskLabels: Record<CaseReport['risk'], string> = {
  HIGH_RISK: 'High risk',
  SUSPICIOUS: 'Suspicious',
  LOW_EVIDENCE: 'Limited evidence',
  UNKNOWN: 'Unknown',
};

function restorableCaseId(fallback?: string): string | null {
  const linked = new URL(window.location.href).searchParams.get('case');
  if (linked && CASE_ID_PATTERN.test(linked)) return linked;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CASE_ID_PATTERN.test(saved)) return saved;
  } catch {
    // The active case can still be recovered when browser storage is unavailable.
  }
  return fallback && CASE_ID_PATTERN.test(fallback) ? fallback : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: 'no-store', ...init });
  const body: unknown = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || response.status >= 500) {
      throw new Error(PROVIDER_UNAVAILABLE);
    }
    const error =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The request could not be completed. Please try again.';
    throw new Error(error);
  }
  return body as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Connection interrupted. Please try again.';
}

function SourceLink({ url }: { url?: string }) {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return (
    <a className="source-link" href={parsed.href} target="_blank" rel="noopener noreferrer">
      {parsed.hostname}
      <ExternalLink size={12} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function Report({ report }: { report: CaseReport }) {
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
      </div>
      {report.injectionDetected && (
        <div className="injection-warning">
          <ShieldAlert size={19} aria-hidden="true" />
          <div>
            <strong>Instructions hidden in the message</strong>
            <p>
              The submitted content contains an attempt to influence the investigation. Treat it as
              untrusted evidence.
            </p>
          </div>
        </div>
      )}
      <section className="report-section" aria-labelledby="evidence-title">
        <div className="section-heading">
          <h3 id="evidence-title">The evidence trail</h3>
          <span className="count-label">{report.evidence.length} observations</span>
        </div>
        <ol className="evidence-list">
          {report.evidence.map((item, index) => (
            <li className={`evidence-item evidence-${item.kind}`} key={item.id}>
              <span className="evidence-marker" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="evidence-body">
                <span className="evidence-kind">
                  {item.kind === 'verified_fact'
                    ? 'Verified fact'
                    : item.kind === 'suspicious_signal'
                      ? 'Suspicious signal'
                      : 'Still unknown'}
                </span>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
                <SourceLink url={item.sourceUrl} />
              </div>
            </li>
          ))}
        </ol>
      </section>
      {report.comparisons.length > 0 && (
        <section className="report-section" aria-labelledby="comparison-title">
          <h3 id="comparison-title">A closer look at the domains</h3>
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
        </section>
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
  );
}

export default function Home() {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [health, setHealth] = useState<HealthView | null>(null);
  const [caseView, setCaseView] = useState<CaseView | null>(null);
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [caseRecoveryError, setCaseRecoveryError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);
  const submissionLock = useRef(false);
  const approvalLock = useRef(false);
  const recoveryLock = useRef(false);
  const caseGeneration = useRef(0);
  const textArea = useRef<HTMLTextAreaElement>(null);

  const refreshHealth = useCallback(async () => {
    setHealthChecking(true);
    try {
      setHealth(await request<HealthView>('/api/health'));
    } catch {
      setHealth({
        configured: false,
        harness: false,
        mcp: false,
        model: null,
        sandbox: false,
        message:
          'Cannot reach the service. Check that the local services are running, then reconnect.',
      });
    } finally {
      setHealthChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await refreshHealth();
      try {
        const saved = restorableCaseId();
        if (saved) {
          const result = await request<CaseView>(`/api/cases/${encodeURIComponent(saved)}`);
          if (active) setCaseView(result);
        }
      } catch (cause) {
        if (active)
          setCaseRecoveryError(`Previous case could not be restored. ${errorMessage(cause)}`);
      } finally {
        if (active) setRestoring(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [refreshHealth]);

  const currentCaseId = caseView?.id;
  const currentCaseStatus = caseView?.status;
  useEffect(() => {
    if (
      !currentCaseId ||
      !currentCaseStatus ||
      restoring ||
      approvalBusy !== null ||
      !['running', 'approval_required'].includes(currentCaseStatus)
    )
      return;
    let active = true;
    let polling = false;
    const id = currentCaseId;
    const generation = caseGeneration.current;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await request<CaseView>(`/api/cases/${encodeURIComponent(id)}`);
        if (active && generation === caseGeneration.current) {
          setCaseView(result);
          setConnectionError('');
        }
      } catch (cause) {
        if (active) setConnectionError(errorMessage(cause));
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentCaseId, currentCaseStatus, approvalBusy, restoring]);

  const reconnect = async () => {
    if (recoveryLock.current || submissionLock.current || approvalLock.current || restoring) return;
    recoveryLock.current = true;
    const generation = ++caseGeneration.current;
    setRestoring(true);
    try {
      await refreshHealth();
      const saved = restorableCaseId(caseView?.id);
      if (saved) {
        const result = await request<CaseView>(`/api/cases/${encodeURIComponent(saved)}`);
        if (generation === caseGeneration.current) setCaseView(result);
      }
      if (generation === caseGeneration.current) {
        setCaseRecoveryError('');
        setConnectionError('');
      }
    } catch (cause) {
      if (generation === caseGeneration.current) {
        setCaseRecoveryError(`The case could not be restored. ${errorMessage(cause)}`);
      }
    } finally {
      recoveryLock.current = false;
      setRestoring(false);
    }
  };

  const investigate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      submissionLock.current ||
      recoveryLock.current ||
      restoring ||
      (!text.trim() && !url.trim())
    )
      return;
    submissionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await request<CaseView>('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), url: url.trim() || undefined }),
      });
      caseGeneration.current += 1;
      setCaseView(result);
      setConnectionError('');
      setCaseRecoveryError('');
      try {
        const caseUrl = new URL(window.location.href);
        caseUrl.searchParams.set('case', result.id);
        window.history.replaceState(window.history.state, '', caseUrl);
      } catch {
        setError(
          'Investigation started. This browser could not update the case link, so keep this tab open.',
        );
      }
      try {
        localStorage.setItem(STORAGE_KEY, result.id);
      } catch {
        setError(
          'Investigation started. This browser could not save the case ID, so keep this tab open.',
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const approve = async (toolCallId: string, decision: 'allow' | 'deny') => {
    if (!caseView || approvalLock.current || recoveryLock.current || restoring) return;
    approvalLock.current = true;
    setApprovalBusy(toolCallId);
    setError('');
    try {
      const result = await request<CaseView>(
        `/api/cases/${encodeURIComponent(caseView.id)}/approval`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolCallId, decision }),
        },
      );
      caseGeneration.current += 1;
      setCaseView(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      approvalLock.current = false;
      setApprovalBusy(null);
    }
  };

  const ready = Boolean(health?.configured && health.harness && health.mcp);
  const setupStatus = !health?.configured ? 'Awaiting model' : !health.mcp ? 'Awaiting tools' : '';
  const setupMessage = !health?.harness
    ? 'Start TrueForge to connect your investigation services.'
    : !health.configured
      ? 'Connect a model in TrueForge to start investigating.'
      : 'Connect the investigation tools in TrueForge to begin.';
  const activeCase = caseView?.status === 'running' || caseView?.status === 'approval_required';
  const busy = submitting || restoring || activeCase;

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to investigation
      </a>
      <header className="site-header">
        <a href="/" className="brand" aria-label="VerifyFirst home">
          <span className="brand-icon">
            <ShieldCheck size={22} strokeWidth={1.8} aria-hidden="true" />
          </span>
          VerifyFirst<span className="brand-period">.</span>
        </a>
        <div className="header-status">
          <span className={`status-dot ${health?.harness ? 'online' : ''}`} />
          <span>
            TrueForge{' '}
            <strong>
              {health === null ? 'connecting' : health.harness ? 'connected' : 'offline'}
            </strong>
            {health?.harness && setupStatus && (
              <small className="setup-status">{setupStatus}</small>
            )}
          </span>
        </div>
      </header>
      <main id="main" className="main-shell">
        <div className="intro">
          <div>
            <div className="eyebrow intro-eyebrow">
              <span />
              The investigation workbench
            </div>
            <h1>
              A little doubt.
              <br />A clearer next step.
            </h1>
            <p>Suspicious message? Follow the evidence before you act.</p>
          </div>
          <div className="intro-note">
            <Fingerprint size={26} strokeWidth={1.3} aria-hidden="true" />
            <p>
              Independent checks.
              <br />
              Visible sources.
              <br />
              <strong>You stay in control.</strong>
            </p>
          </div>
        </div>
        {((health && !ready) || caseRecoveryError) && (
          <div className="service-notice" role="status">
            <div>
              <strong>
                {caseRecoveryError
                  ? 'Reconnect to recover your case'
                  : 'Finish your investigation setup'}
              </strong>
              <p>{caseRecoveryError || setupMessage}</p>
              {!ready && (
                <a
                  className="settings-link"
                  href="http://127.0.0.1:8790"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open TrueForge settings
                  <ExternalLink size={11} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </div>
            <button
              type="button"
              className="secondary-button"
              disabled={healthChecking || restoring || submitting || approvalBusy !== null}
              onClick={() => {
                void reconnect();
              }}
            >
              {healthChecking || restoring ? 'Connecting…' : 'Reconnect'}
            </button>
          </div>
        )}
        <div className="workbench">
          <aside className="input-column">
            <section className="input-card" aria-labelledby="input-heading">
              <div className="card-heading">
                <span className="step-tag">01 / INPUT</span>
                <LockKeyhole size={16} aria-hidden="true" />
              </div>
              <h2 id="input-heading">What feels off?</h2>
              <p className="card-description">
                Add a message or link. We’ll separate what’s known from what needs caution.
              </p>
              <form
                onSubmit={(event) => {
                  void investigate(event);
                }}
              >
                <label htmlFor="message">
                  Message to investigate <span>message or link needed</span>
                </label>
                <textarea
                  id="message"
                  ref={textArea}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                  maxLength={20000}
                  placeholder="Paste the email, text message, or offer here…"
                  disabled={busy}
                  aria-describedby="privacy-note"
                />
                <label htmlFor="source-url">
                  Link to investigate <span>message or link needed</span>
                </label>
                <div className="url-input">
                  <Link2 size={16} aria-hidden="true" />
                  <input
                    id="source-url"
                    type="url"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                    }}
                    placeholder="https://example.com"
                    maxLength={2048}
                    disabled={busy}
                  />
                </div>
                <button
                  type="submit"
                  className="primary-button investigate-button"
                  disabled={busy || (!text.trim() && !url.trim()) || !ready}
                >
                  {submitting || activeCase ? (
                    <LoaderCircle className="spinner" size={17} aria-hidden="true" />
                  ) : (
                    <Search size={17} aria-hidden="true" />
                  )}
                  {submitting
                    ? 'Starting investigation…'
                    : activeCase
                      ? 'Investigation in progress'
                      : restoring
                        ? 'Restoring your case…'
                        : 'Investigate message'}
                  {!busy && <ArrowRight size={17} aria-hidden="true" />}
                </button>
                <p id="privacy-note" className="privacy-note">
                  <LockKeyhole size={12} aria-hidden="true" />
                  Use synthetic or redacted data. Submitted content is sent to your configured model
                  provider. Suspicious links never open automatically.
                </p>
              </form>
            </section>
            <section className="demo-section" aria-labelledby="demo-heading">
              <div className="section-heading">
                <h3 id="demo-heading">Or try a sample</h3>
                <span className="count-label">SYNTHETIC DATA</span>
              </div>
              <div className="demo-list">
                {demos.map((demo, index) => (
                  <button
                    type="button"
                    disabled={busy}
                    className="demo-button"
                    key={demo.id}
                    onClick={() => {
                      setText(demo.text);
                      setUrl(demo.url);
                      setError('');
                      textArea.current?.focus();
                    }}
                  >
                    <span className="demo-number">0{index + 1}</span>
                    <span>
                      <strong>{demo.label}</strong>
                      <small>{demo.caption}</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
            <p className="judgment-note">
              A second look, not a guarantee.
              <br />
              Limited evidence never means verified safe.
            </p>
          </aside>
          <section className="case-column" aria-label="Investigation results">
            {error && (
              <div className="error-notice" role="alert">
                <ShieldAlert size={18} aria-hidden="true" />
                <p>{error}</p>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => {
                    setError('');
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {connectionError && (
              <div className="error-notice" role="status">
                <LoaderCircle size={18} className="spinner" aria-hidden="true" />
                <p>Connection interrupted. Retrying automatically. {connectionError}</p>
              </div>
            )}
            {!caseView ? (
              <div className="empty-case">
                <div className="empty-top">
                  <span className="step-tag">02 / INVESTIGATION</span>
                  <span className="neutral-badge">
                    {restoring ? 'Restoring case' : !ready ? 'Setup needed' : 'Ready when you are'}
                  </span>
                </div>
                <div className="empty-intro">
                  <div className="empty-icon">
                    <ShieldCheck size={35} strokeWidth={1.3} aria-hidden="true" />
                    <span>
                      <Check size={12} />
                    </span>
                  </div>
                  <h2>
                    From uneasy feeling
                    <br />
                    to informed decision.
                  </h2>
                  <p>
                    Get a clear assessment backed by a trail you can inspect. No blind trust
                    required.
                  </p>
                </div>
                <ol className="process-list">
                  <li>
                    <span className="process-number">1</span>
                    <div>
                      <h3>Inspect the signals</h3>
                      <p>Look for pressure, impersonation, and requests that don’t add up.</p>
                    </div>
                  </li>
                  <li>
                    <span className="process-number">2</span>
                    <div>
                      <h3>Cross-check the story</h3>
                      <p>Compare claims and domains with independent reference sources.</p>
                    </div>
                  </li>
                  <li>
                    <span className="process-number">3</span>
                    <div>
                      <h3>Choose your next move</h3>
                      <p>
                        Review the evidence and safer next steps. Any report export needs your
                        approval.
                      </p>
                    </div>
                  </li>
                </ol>
                <div className="empty-footer">
                  <CheckCheck size={16} aria-hidden="true" />
                  <span>Evidence first. Action only with your say.</span>
                </div>
              </div>
            ) : (
              <div className="case-card">
                <div className="case-header">
                  <div>
                    <span className="step-tag">02 / INVESTIGATION</span>
                    <p className="case-id">Case {caseView.id.slice(0, 8)}</p>
                  </div>
                  <span
                    className={`neutral-badge ${caseView.status === 'running' ? 'running-badge' : ''}`}
                  >
                    {caseView.status === 'running' && (
                      <LoaderCircle size={13} className="spinner" aria-hidden="true" />
                    )}
                    {caseView.status === 'approval_required'
                      ? 'Approval needed'
                      : caseView.status === 'running'
                        ? 'Investigating'
                        : caseView.status === 'complete'
                          ? 'Complete'
                          : caseView.status === 'cancelled'
                            ? 'Cancelled'
                            : 'Needs attention'}
                  </span>
                </div>
                {caseView.report ? (
                  <Report report={caseView.report} />
                ) : (
                  <div className="pending-report">
                    <Search size={27} strokeWidth={1.5} aria-hidden="true" />
                    <h2>
                      {caseView.status === 'error'
                        ? 'The investigation was interrupted.'
                        : caseView.status === 'cancelled'
                          ? 'This investigation was cancelled.'
                          : 'Following the evidence…'}
                    </h2>
                    <p>
                      {caseView.status === 'error' || caseView.status === 'cancelled'
                        ? 'You can start a new investigation from the message panel.'
                        : 'Observations will appear here as the investigation progresses. You can follow each step below.'}
                    </p>
                  </div>
                )}
                {caseView.error && (
                  <div className="error-notice" role="alert">
                    <p>{PROVIDER_UNAVAILABLE}</p>
                  </div>
                )}
                {caseView.approvals.map((approval) => (
                  <section
                    className="approval-card"
                    aria-labelledby={`approval-${approval.toolCallId}`}
                    key={approval.toolCallId}
                  >
                    <div className="eyebrow">
                      <LockKeyhole size={13} aria-hidden="true" />
                      Your decision
                    </div>
                    <h3 id={`approval-${approval.toolCallId}`}>Allow this report export?</h3>
                    <p>
                      The investigation is paused at a TrueForge approval gate. Review the exact
                      request before allowing it.
                    </p>
                    <dl>
                      <div>
                        <dt>Tool</dt>
                        <dd>
                          <code>{approval.toolName}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Case ID</dt>
                        <dd>
                          <code>{caseView.id}</code>
                        </dd>
                      </div>
                    </dl>
                    <details>
                      <summary>View exact tool arguments</summary>
                      <pre>{approval.arguments}</pre>
                    </details>
                    <div className="approval-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={!approval.actionable || approvalBusy !== null || restoring}
                        onClick={() => {
                          void approve(approval.toolCallId, 'allow');
                        }}
                      >
                        <Check size={16} aria-hidden="true" />
                        {approvalBusy === approval.toolCallId
                          ? 'Sending decision…'
                          : 'Allow export'}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!approval.actionable || approvalBusy !== null || restoring}
                        onClick={() => {
                          void approve(approval.toolCallId, 'deny');
                        }}
                      >
                        Deny export
                      </button>
                    </div>
                    {!approval.actionable && (
                      <p className="approval-wait">
                        Waiting for the approval request to become actionable.
                      </p>
                    )}
                  </section>
                ))}
                {caseView.exported && (
                  <a
                    className="download-link"
                    href={`/api/cases/${encodeURIComponent(caseView.id)}/export`}
                    download
                  >
                    <ArrowDownToLine size={17} aria-hidden="true" />
                    Download evidence report
                    <ArrowRight size={16} aria-hidden="true" />
                  </a>
                )}
                <section className="activity-section" aria-labelledby="activity-title">
                  <div className="section-heading">
                    <h3 id="activity-title">Investigation activity</h3>
                    <span className="count-label">TRUEFORGE</span>
                  </div>
                  <ol className="activity-list">
                    {caseView.activity.map((activity) => (
                      <li key={activity.id}>
                        <span className="activity-dot" />
                        <div>
                          <strong>{activity.label}</strong>
                          <p>{activity.detail}</p>
                        </div>
                        <time dateTime={activity.timestamp}>
                          {new Date(activity.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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
              </div>
            )}
          </section>
        </div>
        <footer className="site-footer">
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            VerifyFirst
          </span>
          <p>Stay curious. Check the source. Keep control.</p>
          <span>Powered by TrueForge</span>
        </footer>
      </main>
    </>
  );
}
