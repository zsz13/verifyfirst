import { parse } from 'tldts';
import { domainToASCII, domainToUnicode } from 'node:url';

export const ORGANIZATIONS = [
  {
    name: 'Chase',
    aliases: ['chase', 'jpmorgan'],
    domain: 'chase.com',
    contactSource: 'https://www.chase.com/digital/resources/privacy-security/security/report-fraud',
  },
  {
    name: 'Bank of America',
    aliases: ['bank of america', 'bofa'],
    domain: 'bankofamerica.com',
    contactSource:
      'https://www.bankofamerica.com/security-center/report-suspicious-communications/',
  },
  {
    name: 'Wells Fargo',
    aliases: ['wells fargo'],
    domain: 'wellsfargo.com',
    contactSource: 'https://www.wellsfargo.com/privacy-security/fraud/report/',
  },
  {
    name: 'PayPal',
    aliases: ['paypal'],
    domain: 'paypal.com',
    contactSource: 'https://www.paypal.com/us/security/report-suspicious-messages',
  },
  {
    name: 'USPS',
    aliases: ['usps', 'united states postal'],
    domain: 'usps.com',
    contactSource: 'https://www.uspis.gov/news/scam-article/smishing-package-tracking-text-scams',
  },
] as const;
export function normalizeDomain(raw: string): string {
  const value = raw.trim();
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol))
    throw new Error('Invalid domain input.');
  const domain = domainToASCII(url.hostname.toLowerCase().replace(/\.$/, ''));
  if (!domain || domain.length > 253 || !/^[a-z0-9.-]+$/.test(domain))
    throw new Error('Invalid hostname.');
  return domain;
}
export function registeredDomain(host: string): string | null {
  return parse(host, { allowPrivateDomains: true }).domain;
}
export function domainSignals(host: string): string[] {
  const signals: string[] = [];
  if (host.split('.').some((label) => label.startsWith('xn--')))
    signals.push(
      `Internationalized/punycode hostname (${domainToUnicode(host)}); visually similar characters can impersonate brands.`,
    );
  const registered = registeredDomain(host);
  for (const org of ORGANIZATIONS) {
    const brand = org.domain.split('.')[0];
    if (brand && host.replace(/-/g, '').includes(brand) && registered !== org.domain)
      signals.push(
        `Hostname contains ${org.name}'s brand but its registered domain is not ${org.domain}.`,
      );
  }
  if (host.split('.').length > 4)
    signals.push('Unusually deep subdomain nesting can conceal the registered domain.');
  return signals;
}
export interface SubmissionAnalysis {
  urls: string[];
  domains: string[];
  organizations: string[];
  phoneNumbers: string[];
  requestedActions: string[];
  urgency: boolean;
  sensitiveRequest: boolean;
  injectionDetected: boolean;
  injectionIndicators: string[];
}
export function analyzeText(text: string, suppliedUrl = ''): SubmissionAnalysis {
  const urls = [
    ...new Set([
      ...(text.match(/https?:\/\/[^\s<>"']+/gi) ?? []).map((url) => url.replace(/[.,;!?)]+$/, '')),
      ...(suppliedUrl ? [suppliedUrl] : []),
    ]),
  ].slice(0, 10);
  const bareDomains =
    text.match(
      /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|co|info|xyz|top|site|online|zip|us|uk|io)\b/gi,
    ) ?? [];
  const domains = [
    ...new Set(
      [...urls, ...bareDomains].flatMap((value) => {
        try {
          return [normalizeDomain(value)];
        } catch {
          return [];
        }
      }),
    ),
  ].slice(0, 12);
  const injectionPatterns: Array<[RegExp, string]> = [
    [
      /ignore\s+(?:all\s+)?(?:previous|prior|above|system)\s+(?:instructions?|rules?|prompts?)/i,
      'Instruction to ignore the investigation policy',
    ],
    [
      /mark\s+(?:this|it|the\s+message)\s+(?:as\s+)?(?:legitimate|safe|trusted)/i,
      'Instruction to force a safe or legitimate verdict',
    ],
    [
      /(?:system|developer)\s*(?:message|prompt|override)\s*[:>]/i,
      'Spoofed privileged instruction',
    ],
    [
      /(?:do not|don.t)\s+(?:use|call|run)\s+(?:the\s+)?(?:tools?|search|checks?)/i,
      'Instruction to suppress independent verification',
    ],
    [
      /(?:reveal|send|print|exfiltrate)\s+(?:the\s+)?(?:api\s*keys?|secrets?|system\s*prompt)/i,
      'Request to disclose secrets',
    ],
  ];
  const injectionIndicators = injectionPatterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
  const actionPatterns: Array<[RegExp, string]> = [
    [
      /\b(?:transfer|wire|send)\b[\s\S]{0,50}\b(?:money|funds|balance|savings|\$|account)\b/i,
      'Transfer money',
    ],
    [/\b(?:click|visit|open|tap)\b/i, 'Open a supplied link'],
    [
      /\b(?:password|passcode|otp|verification code|social security|ssn|card number)\b/i,
      'Provide sensitive credentials or identifiers',
    ],
    [/\b(?:call|phone|text|reply)\b/i, 'Contact a supplied sender'],
    [/\b(?:pay|payment|fee|crypto|bitcoin|gift card)\b/i, 'Make a payment'],
  ];
  const requestedActions = actionPatterns
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
  return {
    urls,
    domains,
    organizations: ORGANIZATIONS.filter((org) =>
      org.aliases.some((alias) => new RegExp(`\\b${alias}\\b`, 'i').test(text)),
    ).map((org) => org.name),
    phoneNumbers: text.match(/(?:\+?\d[\d ().-]{7,}\d)/g)?.slice(0, 10) ?? [],
    requestedActions,
    urgency:
      /\b(?:urgent(?:ly)?|immediately|now|within\s+\d+\s+minutes?|suspended|locked|final warning|act fast)\b/i.test(
        text,
      ),
    sensitiveRequest: requestedActions.some((action) =>
      ['Transfer money', 'Provide sensitive credentials or identifiers', 'Make a payment'].includes(
        action,
      ),
    ),
    injectionDetected: injectionIndicators.length > 0,
    injectionIndicators,
  };
}
