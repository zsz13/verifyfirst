import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export class InvestigationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export function parsePublicUrl(raw: string): URL {
  if (
    raw.length > 4096 ||
    /[\\\s]/u.test(raw) ||
    [...raw].some((character) => character.charCodeAt(0) < 32)
  )
    throw new InvestigationError('INVALID_URL', 'URL contains forbidden characters.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvestigationError('INVALID_URL', 'Provide an absolute HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new InvestigationError(
      'UNSAFE_URL',
      'Only HTTP(S) URLs without credentials are permitted.',
    );
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    !hostname.includes('.') ||
    ipaddr.isValid(hostname.replace(/^\[|\]$/g, ''))
  )
    throw new InvestigationError('SSRF_BLOCKED', 'Local hosts and IP literals are not permitted.');
  if (url.port && !['80', '443'].includes(url.port))
    throw new InvestigationError('SSRF_BLOCKED', 'Only standard web ports are permitted.');
  url.hostname = hostname;
  url.hash = '';
  return url;
}
export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
export async function resolvePublic(
  hostname: string,
  resolver: Resolver = (host) => lookup(host, { all: true, verbatim: true }),
) {
  const addresses = await resolver(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
    throw new InvestigationError(
      'SSRF_BLOCKED',
      'Domain resolves to a non-public address or has no usable address.',
    );
  return addresses;
}
export interface PageResult {
  finalUrl: string;
  status: number;
  contentType: string;
  text: string;
  redirects: Array<{ from: string; to: string; status: number }>;
}
async function requestOnce(
  url: URL,
  signal: AbortSignal,
): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  const addresses = await resolvePublic(url.hostname);
  signal.throwIfAborted();
  const pinned = addresses[0];
  if (!pinned) throw new InvestigationError('DNS_UNAVAILABLE', 'Domain has no usable address.');
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(
      url,
      {
        method: 'GET',
        agent: false,
        signal,
        headers: {
          'User-Agent': 'VerifyFirst/1.0 (trust-verification; no browser execution)',
          Accept: 'text/html,application/json,text/plain',
          'Accept-Encoding': 'identity',
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, _options.all ? [pinned] : pinned.address, pinned.family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const contentType = String(response.headers['content-type'] ?? '');
        if ([301, 302, 303, 307, 308].includes(status)) {
          response.destroy();
          resolve({ status, location: response.headers.location, contentType, body: '' });
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1_048_576)
            response.destroy(
              new InvestigationError(
                'RESPONSE_TOO_LARGE',
                'Response exceeds the inspection byte limit.',
              ),
            );
          else chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }),
        );
        response.on('error', reject);
      },
    );
    request.on('error', reject);
    request.end();
  });
}
export async function safeFetch(raw: string): Promise<PageResult> {
  let url = parsePublicUrl(raw);
  const redirects: PageResult['redirects'] = [];
  const deadline = Date.now() + 18_000;
  for (let hop = 0; hop <= 4; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new InvestigationError('TIMEOUT', 'Inspection deadline exceeded.');
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new InvestigationError('TIMEOUT', 'Inspection deadline exceeded.')),
      remaining,
    );
    timer.unref();
    let result: Awaited<ReturnType<typeof requestOnce>>;
    try {
      result = await Promise.race([
        requestOnce(url, controller.signal),
        new Promise<never>((_, reject) =>
          controller.signal.addEventListener(
            'abort',
            () => reject(new InvestigationError('TIMEOUT', 'Inspection deadline exceeded.')),
            {
              once: true,
            },
          ),
        ),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (result.location && [301, 302, 303, 307, 308].includes(result.status)) {
      const next = parsePublicUrl(new URL(result.location, url).href);
      if (url.protocol === 'https:' && next.protocol === 'http:')
        throw new InvestigationError('UNSAFE_REDIRECT', 'HTTPS to HTTP redirect was blocked.');
      redirects.push({ from: url.href, to: next.href, status: result.status });
      url = next;
      continue;
    }
    return {
      finalUrl: url.href,
      status: result.status,
      contentType: result.contentType,
      text: result.body,
      redirects,
    };
  }
  throw new InvestigationError('TOO_MANY_REDIRECTS', 'Redirect limit exceeded.');
}
export function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sourceExcerpt(html: string, queryTerms: string[]): string {
  // Official pages may have large menus and public comments. Persist only a short editorial excerpt.
  const editorial = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  let content =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(editorial)?.[1] ??
    /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(editorial)?.[1] ??
    editorial;
  const comments =
    /<(?:section|div|ol|ul|form)\b[^>]*(?:id|class)\s*=\s*["'][^"']*\b(?:comments?|comment-wrapper|disqus_thread)\b/i.exec(
      content,
    );
  if (comments?.index !== undefined) content = content.slice(0, comments.index);
  const text = plainText(content);
  const lower = text.toLowerCase();
  const terms = [
    ...new Set(queryTerms.map((term) => term.toLowerCase()).filter((term) => term.length > 2)),
  ];
  const starts = [
    0,
    ...terms.flatMap((term) => {
      const position = lower.indexOf(term);
      return position < 0 ? [] : [Math.max(0, position - 80)];
    }),
  ];
  const start =
    starts.sort((left, right) => {
      const score = (position: number) =>
        terms.filter((term) => lower.slice(position, position + 480).includes(term)).length;
      return score(right) - score(left);
    })[0] ?? 0;
  return text
    .slice(start, start + 480)
    .trim()
    .split(/\s+/)
    .slice(0, 70)
    .join(' ');
}
