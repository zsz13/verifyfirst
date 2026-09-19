import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../components/site-chrome';

export const metadata: Metadata = { title: 'How it works - VerifyFirst' };

export default function HowItWorks() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader active="how" />
      <main id="main" className="main-shell">
        <article className="info-page">
          <span className="eyebrow">Evidence before action</span>
          <h1>A check you can follow.</h1>
          <p className="info-lead">
            VerifyFirst investigates suspicious messages and identities, then shows what it found,
            where it looked, and what remains uncertain.
          </p>
          <div className="info-grid">
            <section>
              <span className="step-tag">01 / Inspect</span>
              <h2>Look beyond the message</h2>
              <p>
                We extract links, claimed organizations, sender details and requests. Domain and URL
                tools check public DNS, available registration data, redirects and lookalike
                signals. Email checks add mail-domain records. Phone checks use optional
                IPQualityScore reputation data alongside local format and country information. You
                can supply a message, multiple links, phone, email and claimed organization in one
                case.
              </p>
            </section>
            <section>
              <span className="step-tag">02 / Verify</span>
              <h2>Find an independent reference</h2>
              <p>
                Organization checks use maintained official references and fetch their pages
                independently. Trusted-source research uses a bounded catalog of consumer-protection
                sources. A message’s own phone number, link or signature never becomes proof of
                identity.
              </p>
            </section>
            <section>
              <span className="step-tag">03 / Show the work</span>
              <h2>TrueForge runs the investigation</h2>
              <p>
                TrueForge coordinates the model, MCP tools and native sandbox, records tool
                activity, and preserves sessions for reconnection. Sensitive report export pauses at
                its native human approval gate. You choose Allow or Deny.
              </p>
            </section>
            <section>
              <span className="step-tag">04 / Decide</span>
              <h2>Facts have sources. Assessments have limits.</h2>
              <p>
                Verified facts, suspicious signals and unknowns are labeled separately. The risk
                assessment summarizes those observations; it is not a guarantee. Limited evidence
                never means verified safe. Review the evidence and use an independent contact
                channel.
              </p>
            </section>
          </div>
          <section className="info-callout">
            <h2>Your data and your control</h2>
            <p>
              Submitted content and retrieved pages are untrusted evidence, never instructions.
              Suspicious links are inspected by guarded server tools without executing page
              JavaScript; they never open automatically in your browser.
            </p>
            <p>
              Use synthetic or redacted content. Investigations are stored locally and submitted
              content reaches your configured model provider. DNS, registration and official-source
              requests reach external services. When IPQualityScore is configured, the supplied
              phone number is sent to that reputation provider. Export requires approval and redacts
              common contact patterns, but automated redaction cannot catch every personal detail.
              Review a report before sharing it.
            </p>
          </section>
          <section className="info-limitations">
            <h2>Know the limits</h2>
            <ul>
              <li>
                We do not establish who actually controls a sender address, phone number or account.
              </li>
              <li>
                Domain age, DNS records and valid phone formatting are signals, not proof of trust
                or fraud. A third-party phone reputation score is not proof that a caller is
                fraudulent or trustworthy.
              </li>
              <li>
                Sources can be unavailable or outdated; missing results stay unknown. Coverage is
                limited to supported checks and official references.
              </li>
              <li>
                VerifyFirst does not move money, contact a sender, or submit a complaint for you.
                Export creates a local report.
              </li>
            </ul>
          </section>
          <Link className="primary-button" href="/">
            Start an investigation
          </Link>
        </article>
        <SiteFooter />
      </main>
    </>
  );
}
