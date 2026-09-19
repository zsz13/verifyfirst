import { readFile } from 'node:fs/promises';

export const IPQS_SOURCE =
  'https://www.ipqualityscore.com/documentation/phone-number-validation-api/response-parameters';
const ENDPOINT = 'https://www.ipqualityscore.com/api/json/phone/';
const booleanFields = [
  'valid',
  'active',
  'risky',
  'recent_abuse',
  'spammer',
  'VOIP',
  'prepaid',
  'leaked',
] as const;
const stringFields = ['carrier', 'line_type', 'country', 'region'] as const;
export type PhoneSignals = Partial<Record<(typeof booleanFields)[number], boolean | null>> &
  Partial<Record<(typeof stringFields)[number], string | null>> & { fraud_score?: number };
export type PhoneReputation =
  | { status: 'available'; signals: PhoneSignals }
  | { status: 'unconfigured' | 'unavailable'; reason: string };

/** Only non-identifying fields survive this boundary; raw provider payloads are never persisted. */
export function parsePhoneReputation(value: unknown): PhoneReputation {
  if (!value || typeof value !== 'object' || !('success' in value) || value.success !== true)
    return {
      status: 'unavailable',
      reason: 'IPQS did not complete the lookup; reputation remains unknown.',
    };
  const raw = value as Record<string, unknown>;
  const signals: PhoneSignals = {};
  for (const field of booleanFields) {
    const entry = raw[field];
    if (typeof entry === 'boolean' || entry === null) signals[field] = entry;
  }
  for (const field of stringFields) {
    const entry = raw[field];
    if (entry === null || entry === 'N/A' || entry === '') signals[field] = null;
    else if (
      typeof entry === 'string' &&
      entry.length <= 120 &&
      ![...entry].some((character) => character.charCodeAt(0) < 32) &&
      !/[<>@]/u.test(entry)
    )
      signals[field] = entry;
  }
  if (
    typeof raw.fraud_score === 'number' &&
    Number.isInteger(raw.fraud_score) &&
    raw.fraud_score >= 0 &&
    raw.fraud_score <= 100
  )
    signals.fraud_score = raw.fraud_score;
  return Object.keys(signals).length
    ? { status: 'available', signals }
    : { status: 'unavailable', reason: 'IPQS returned no supported reputation signals.' };
}

/** Render missing data explicitly; a provider score is never a confidence percentage. */
export function formatPhoneSignals(signals: PhoneSignals): string {
  const labels: Array<[keyof PhoneSignals, string]> = [
    ['fraud_score', 'Fraud score'],
    ['valid', 'Valid'],
    ['active', 'Active'],
    ['risky', 'Risky'],
    ['recent_abuse', 'Recent abuse'],
    ['spammer', 'Reported spammer'],
    ['VOIP', 'VoIP'],
    ['prepaid', 'Prepaid'],
    ['leaked', 'Reported data leak'],
    ['carrier', 'Carrier'],
    ['line_type', 'Line type'],
    ['country', 'Country'],
    ['region', 'Region'],
  ];
  return labels
    .map(([field, label]) => {
      const value = signals[field];
      const displayed =
        value === undefined || value === null
          ? 'unknown'
          : typeof value === 'boolean'
            ? value
              ? 'yes'
              : 'no'
            : field === 'fraud_score'
              ? `${value}/100`
              : String(value);
      return `${label}: ${displayed}`;
    })
    .join('; ');
}

export async function lookupPhoneReputation(e164: string): Promise<PhoneReputation> {
  const unavailable = (reason: string): PhoneReputation => ({ status: 'unavailable', reason });
  if (!/^\+[1-9]\d{3,14}$/.test(e164))
    return unavailable('A normalized international number is required.');
  let key = process.env.IPQS_API_KEY?.trim();
  try {
    if (!key && process.env.IPQS_API_KEY_FILE) {
      const contents = await readFile(process.env.IPQS_API_KEY_FILE, 'utf8');
      key = contents.length <= 4096 ? contents.trim() : undefined;
      if (!key) return unavailable('IPQS credential file is empty or invalid.');
    }
  } catch {
    return unavailable('IPQS credential file is unavailable.');
  }
  if (!key)
    return { status: 'unconfigured', reason: 'Optional IPQS reputation lookup is not configured.' };
  if (key.length > 4096 || /\s/.test(key))
    return unavailable('IPQS credential configuration is invalid.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'IPQS-KEY': key },
      body: JSON.stringify({ phone: e164, strictness: 0 }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return unavailable(
        response.status === 429
          ? 'IPQS is rate-limited; local checks remain available.'
          : 'IPQS lookup service is unavailable or access was rejected.',
      );
    }
    if (!response.body) return unavailable('IPQS returned an empty response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        return unavailable('IPQS response exceeded the inspection limit.');
      }
      chunks.push(value);
    }
    return parsePhoneReputation(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    // Never include thrown fetch errors or provider messages: they may contain credentials or PII.
    return unavailable('IPQS lookup could not be completed within the service limits.');
  } finally {
    clearTimeout(timer);
  }
}
