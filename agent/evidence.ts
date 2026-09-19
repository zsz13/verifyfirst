import type { Evidence } from './types';

export function evidenceLabel(item: Evidence): string {
  // Preserve clear provenance when viewing reports created before this metadata existed.
  const provider =
    item.provenance === 'third_party' ||
    (item.tool === 'inspect_sender' && item.title === 'IPQS third-party phone reputation');
  if (provider && item.kind === 'verified_fact') return 'Provider observation';
  if (provider && item.kind === 'suspicious_signal') return 'Third-party signal';
  return item.kind === 'verified_fact'
    ? 'Verified fact'
    : item.kind === 'suspicious_signal'
      ? 'Suspicious signal'
      : 'Unknown';
}
