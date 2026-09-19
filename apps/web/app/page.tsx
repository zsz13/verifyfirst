'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  ExternalLink,
  Fingerprint,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { CaseView, HealthView } from '../../../agent/types';
import { BrandMark, SiteFooter, SiteHeader } from './components/site-chrome';
import {
  InvestigationDashboard,
  InvestigationActivity,
} from './components/investigation-dashboard';
import { extractMessageUrls, MAX_INVESTIGATION_URLS } from '../../../agent/input';
import { demos } from '../../../fixtures/demos';

const CASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_UNAVAILABLE =
  'The investigation provider is unavailable. Check your model connection in TrueForge, then try again.';
function restorableCaseId(): string | null {
  const linked = new URL(window.location.href).searchParams.get('case');
  // An explicit case link owns recovery. The root route always starts fresh.
  return linked && CASE_ID_PATTERN.test(linked) ? linked : null;
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

export default function Home() {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [claimedOrganization, setClaimedOrganization] = useState('');
  const [urlMode, setUrlMode] = useState<'detected' | 'manual'>('detected');
  const [formError, setFormError] = useState('');
  const detectedUrls = extractMessageUrls(text);
  const pendingDownload = useRef<string | null>(null);
  const downloadedCases = useRef(new Set<string>());
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

  const updateMessage = (value: string) => {
    setText(value);
    setFormError('');
    if (urlMode === 'detected') {
      const detected = extractMessageUrls(value);
      setUrl(detected.length === 1 ? (detected[0] ?? '') : '');
    }
  };

  useEffect(() => {
    if (!caseView?.exported || downloadedCases.current.has(caseView.id)) return;
    let approvedHere = pendingDownload.current === caseView.id;
    try {
      approvedHere ||= sessionStorage.getItem('verifyfirst.pendingDownload') === caseView.id;
    } catch {
      // In-memory intent still supports browsers with storage disabled.
    }
    if (!approvedHere) return;
    downloadedCases.current.add(caseView.id);
    pendingDownload.current = null;
    try {
      sessionStorage.removeItem('verifyfirst.pendingDownload');
    } catch {
      // Download can continue without browser storage.
    }
    const link = document.createElement('a');
    link.href = `/api/cases/${encodeURIComponent(caseView.id)}/export`;
    link.download = `verifyfirst-${caseView.id}.json`;
    document.body.append(link);
    link.click();
    link.remove();
  }, [caseView]);

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
      const saved = restorableCaseId();
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
    if (submissionLock.current || recoveryLock.current || restoring) return;
    if (
      !text.trim() &&
      !url.trim() &&
      !senderPhone.trim() &&
      !senderEmail.trim() &&
      !claimedOrganization.trim()
    ) {
      setFormError('Add a message, link, sender or organization to investigate.');
      return;
    }
    const links = new Set([...detectedUrls, ...extractMessageUrls(url)]);
    if (links.size > MAX_INVESTIGATION_URLS) {
      setFormError(
        `Investigate up to ${MAX_INVESTIGATION_URLS} unique links at a time. Remove extra links from the message or split it into separate cases.`,
      );
      return;
    }
    setFormError('');
    submissionLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const result = await request<CaseView>('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          // Detected links are already in the immutable message. Avoid duplicating
          // long links into the shorter optional manual-URL field.
          url: urlMode === 'manual' ? url.trim() || undefined : undefined,
          senderPhone: senderPhone.trim() || undefined,
          senderEmail: senderEmail.trim() || undefined,
          claimedOrganization: claimedOrganization.trim() || undefined,
        }),
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
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const approve = async (toolCallId: string, decision: 'allow' | 'deny') => {
    if (!caseView || approvalLock.current || recoveryLock.current || restoring) return;
    if (decision === 'allow') {
      pendingDownload.current = caseView.id;
      try {
        sessionStorage.setItem('verifyfirst.pendingDownload', caseView.id);
      } catch {
        /* In-memory intent remains available. */
      }
    } else {
      pendingDownload.current = null;
      try {
        sessionStorage.removeItem('verifyfirst.pendingDownload');
      } catch {
        // A denial clears in-memory intent even when storage is unavailable.
      }
    }
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
  const showInvestigation = Boolean(caseView || error || connectionError);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to investigation
      </a>
      <SiteHeader
        active="investigate"
        status={
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
        }
      />
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
        <div className={`workbench${showInvestigation ? '' : ' workbench-new'}`}>
          <aside className="input-column">
            <section className="input-card" aria-labelledby="input-heading">
              <div className="card-heading">
                <span className="step-tag">01 / INPUT</span>
                <LockKeyhole size={16} aria-hidden="true" />
              </div>
              <h2 id="input-heading">What feels off?</h2>
              <p className="card-description">
                Add a message, link or sender. We’ll separate what’s known from what needs caution.
              </p>
              <form
                aria-describedby="form-help"
                onSubmit={(event) => {
                  void investigate(event);
                }}
              >
                <label htmlFor="message">Message to investigate</label>
                <textarea
                  id="message"
                  ref={textArea}
                  value={text}
                  onChange={(event) => {
                    updateMessage(event.target.value);
                  }}
                  maxLength={12000}
                  placeholder="Paste the email, text message, or offer here…"
                  disabled={busy}
                  aria-describedby="privacy-note"
                />
                <label htmlFor="source-url">
                  Link to investigate{' '}
                  {urlMode === 'detected' && url && (
                    <span className="detected-badge">Detected from message</span>
                  )}
                </label>
                <div className="url-input">
                  <Link2 size={16} aria-hidden="true" />
                  <input
                    id="source-url"
                    type="url"
                    value={url}
                    onChange={(event) => {
                      setUrlMode('manual');
                      setUrl(event.target.value);
                      setFormError('');
                    }}
                    placeholder="https://example.com"
                    maxLength={2048}
                    disabled={busy}
                  />
                  {url && (
                    <button
                      className="clear-input"
                      type="button"
                      aria-label="Clear link input"
                      disabled={busy}
                      onClick={() => {
                        setUrl('');
                        setUrlMode('manual');
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {detectedUrls.length > 1 && (
                  <div className="detected-links" aria-live="polite">
                    <strong>{detectedUrls.length} links detected from message</strong>
                    <ul>
                      {detectedUrls.map((link) => (
                        <li key={link}>
                          <Link2 size={12} aria-hidden="true" />
                          <code>{link}</code>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {detectedUrls.length > 0 && (
                  <p className="field-note">
                    All links in the message will be checked. Edit the message to remove a link from
                    the investigation.
                  </p>
                )}
                <fieldset className="identity-fields" aria-describedby="sender-help">
                  <legend>
                    Sender details <span>optional · combine any fields</span>
                  </legend>
                  <label htmlFor="sender-phone">Phone number</label>
                  <input
                    className="sender-input"
                    id="sender-phone"
                    type="tel"
                    autoComplete="off"
                    value={senderPhone}
                    onChange={(event) => {
                      setSenderPhone(event.target.value);
                      setFormError('');
                    }}
                    placeholder="+1 202 555 0123"
                    maxLength={80}
                    disabled={busy}
                  />
                  <label htmlFor="sender-email">Email address</label>
                  <input
                    className="sender-input"
                    id="sender-email"
                    type="email"
                    autoComplete="off"
                    spellCheck={false}
                    value={senderEmail}
                    onChange={(event) => {
                      setSenderEmail(event.target.value);
                      setFormError('');
                    }}
                    placeholder="sender@example.com"
                    maxLength={320}
                    disabled={busy}
                  />
                  <label htmlFor="claimed-organization">Claimed organization</label>
                  <input
                    className="sender-input"
                    id="claimed-organization"
                    type="text"
                    autoComplete="off"
                    value={claimedOrganization}
                    onChange={(event) => {
                      setClaimedOrganization(event.target.value);
                      setFormError('');
                    }}
                    placeholder="For example, Chase"
                    maxLength={160}
                    disabled={busy}
                  />
                  <p id="sender-help" className="field-note">
                    Add the details you have. Phone reputation, email records and official
                    references are checked together; none proves identity on its own.
                  </p>
                </fieldset>
                <p id="form-help" className="form-help">
                  A message, link, sender or organization is enough to begin.
                </p>
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <button
                  type="submit"
                  className="primary-button investigate-button"
                  disabled={busy || !ready}
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
                        : 'Investigate'}
                  {!busy && <ArrowRight size={17} aria-hidden="true" />}
                </button>
                <p id="privacy-note" className="privacy-note">
                  <LockKeyhole size={12} aria-hidden="true" />
                  Use synthetic or redacted data. Submitted content is sent to your configured model
                  provider. When configured, IPQS receives the supplied phone number. Suspicious
                  links never open automatically.
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
                      const links = extractMessageUrls(demo.text);
                      setUrl(demo.url || (links.length === 1 ? (links[0] ?? '') : ''));
                      setUrlMode('detected');
                      setSenderPhone('');
                      setSenderEmail('');
                      setClaimedOrganization('');
                      setFormError('');
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
          {showInvestigation && (
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
                      {restoring
                        ? 'Restoring case'
                        : !ready
                          ? 'Setup needed'
                          : 'Ready when you are'}
                    </span>
                  </div>
                  <div className="empty-intro">
                    <div className="empty-icon">
                      <BrandMark size={36} />
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
                    <InvestigationDashboard
                      key={caseView.id}
                      caseView={caseView}
                      report={caseView.report}
                    />
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
                    <section className="export-ready" aria-label="Exported report">
                      <div>
                        <CheckCheck size={18} aria-hidden="true" />
                        <strong>Your evidence report is ready</strong>
                      </div>
                      <p>
                        After you approve, the JSON evidence downloads automatically. If it did not
                        start, download it again below.
                      </p>
                      <div className="export-actions">
                        <a
                          className="download-link"
                          href={`/api/cases/${encodeURIComponent(caseView.id)}/export`}
                          download
                        >
                          <ArrowDownToLine size={16} aria-hidden="true" />
                          Download again <span>JSON</span>
                        </a>
                        <a
                          className="secondary-button"
                          href={`/reports/${encodeURIComponent(caseView.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Print / save PDF <ExternalLink size={13} aria-hidden="true" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </div>
                    </section>
                  )}
                  {!caseView.report && <InvestigationActivity caseView={caseView} />}
                </div>
              )}
            </section>
          )}
        </div>
        <SiteFooter />
      </main>
    </>
  );
}
