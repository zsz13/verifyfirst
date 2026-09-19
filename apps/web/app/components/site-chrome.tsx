import Link from 'next/link';
import { Github } from 'lucide-react';

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#28523e" />
      <path d="M8 12V8h12M8 18v6h6" stroke="#a6bca2" strokeWidth="2" strokeLinecap="round" />
      <path
        d="m12 16 4 4 8-9"
        stroke="#fffefa"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteHeader({
  active,
  status,
}: {
  active: 'investigate' | 'how' | 'safe';
  status?: React.ReactNode;
}) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="VerifyFirst home">
        <BrandMark />
        VerifyFirst
      </Link>
      <nav className="site-nav" aria-label="Main navigation">
        <Link href="/" aria-current={active === 'investigate' ? 'page' : undefined}>
          Investigate
        </Link>
        <Link href="/how-it-works" aria-current={active === 'how' ? 'page' : undefined}>
          How it works
        </Link>
        <Link href="/stay-safe" aria-current={active === 'safe' ? 'page' : undefined}>
          Stay safe
        </Link>
      </nav>
      {status}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-primary">
        <a href="https://github.com/zsz13/verifyfirst" target="_blank" rel="noopener noreferrer">
          <Github size={16} aria-hidden="true" />
          github.com/zsz13/verifyfirst<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <span>Team XXI</span>
        <a href="https://trueforge.dev" target="_blank" rel="noopener noreferrer">
          Powered by TrueForge<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
      <p>
        Built for{' '}
        <a
          href="https://hackersquad.io/events/truefoundry-agent-harness-hackathon"
          target="_blank"
          rel="noopener noreferrer"
        >
          The Agent Harness Hackathon / HackerSquad
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </p>
    </footer>
  );
}
