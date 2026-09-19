import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter, SiteHeader } from '../components/site-chrome';

export const metadata: Metadata = { title: 'Stay safe - VerifyFirst' };

export default function StaySafe() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteHeader active="safe" />
      <main id="main" className="main-shell">
        <article className="info-page">
          <span className="eyebrow">Small pauses. Safer decisions.</span>
          <h1>Keep control of the next step.</h1>
          <p className="info-lead">
            Urgency makes careful decisions harder. Give yourself time and verify through a channel
            you find independently.
          </p>
          <ol className="safety-list">
            <li>
              <span>01</span>
              <div>
                <h2>Stop before clicking or paying</h2>
                <p>
                  Do not use unexpected links or attachments to resolve an urgent account problem.
                  Open the organization’s app or a website you already know.
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h2>Contact the organization independently</h2>
                <p>
                  Use the number on your bank card or an independently verified official website. Do
                  not rely on the contact details in the suspicious message.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h2>Protect credentials and verification codes</h2>
                <p>
                  Do not share passwords, one-time codes or remote access in response to an
                  unexpected request. Use multifactor authentication on important accounts.
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <h2>If you already acted, respond promptly</h2>
                <p>
                  Contact your bank or payment provider through a trusted channel. Change exposed
                  passwords through the official service. Save relevant evidence and use official
                  reporting resources.
                </p>
              </div>
            </li>
          </ol>
          <section className="info-callout">
            <h2>Authoritative help</h2>
            <div className="resource-links">
              <a
                href="https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams"
                target="_blank"
                rel="noopener noreferrer"
              >
                FTC: recognize and avoid phishing
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <a href="https://www.ic3.gov/" target="_blank" rel="noopener noreferrer">
                FBI Internet Crime Complaint Center (IC3)
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
            <p>
              Reporting options depend on your location and circumstances. These U.S. resources
              provide practical guidance; local authorities may have additional channels.
            </p>
          </section>
          <Link className="primary-button" href="/">
            Check a suspicious message
          </Link>
        </article>
        <SiteFooter />
      </main>
    </>
  );
}
