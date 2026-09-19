import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VerifyFirst - Evidence-backed scam verification',
  applicationName: 'VerifyFirst',
  description:
    'Investigate suspicious messages with independent evidence, transparent sources, and approval before export.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
