import { domainToASCII } from 'node:url';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { parsePublicUrl } from './network.ts';

export type SenderIdentity =
  | { kind: 'email'; domain: string }
  | { kind: 'phone'; e164: string; country?: string; numberType?: string }
  | { kind: 'unknown'; reason: string };

/** Parse claimed identity only. Formatting and numbering metadata never authenticate a sender. */
export function parseSender(raw: string): SenderIdentity {
  const value = raw.trim();
  if (!value || value.length > 320)
    return { kind: 'unknown', reason: 'Provide one email address or international phone number.' };
  if (value.includes('@')) {
    const parts = value.split('@');
    const local = parts[0] ?? '';
    const rawDomain = parts[1] ?? '';
    const domain = domainToASCII(rawDomain.toLowerCase());
    // Deliberately support a conservative mailbox format, not display names or quoted addresses.
    if (
      parts.length !== 2 ||
      /[\s/\\?#:%@]/u.test(rawDomain) ||
      local.length > 64 ||
      !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/i.test(local) ||
      !domain ||
      domain.length > 253 ||
      domain.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))
    )
      return {
        kind: 'unknown',
        reason:
          'The sender is not a supported email address format. No identity conclusion follows.',
      };
    try {
      parsePublicUrl(`https://${domain}`);
    } catch {
      return {
        kind: 'unknown',
        reason:
          'The email domain is not an eligible public hostname; network inspection was blocked.',
      };
    }
    return { kind: 'email', domain };
  }
  if (!/^\+[\d ()-]+$/.test(value))
    return {
      kind: 'unknown',
      reason:
        'Phone normalization requires an explicit +country code. Country, line type and identity remain unknown.',
    };
  const phone = parsePhoneNumberFromString(value);
  if (!phone?.isValid())
    return {
      kind: 'unknown',
      reason:
        'The phone number does not match a supported international numbering plan. This does not establish fraud.',
    };
  const numberType = phone.getType();
  return {
    kind: 'phone',
    e164: phone.number,
    ...(phone.country ? { country: phone.country } : {}),
    ...(numberType ? { numberType } : {}),
  };
}
