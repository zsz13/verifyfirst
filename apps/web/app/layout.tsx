import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VerifyFirst — Evidence before action',
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
