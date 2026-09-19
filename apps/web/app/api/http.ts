import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '../../../../agent/cases';

export function guardRequest(request: Request) {
  const host = request.headers.get('host');
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host))
    throw new AppError('VerifyFirst is available only on localhost.', 403);
  // Next may normalize request.url to its bind address; validate the actual Host header.
  const url = new URL(`${new URL(request.url).protocol}//${host}`);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin)
    throw new AppError('Cross-origin requests are not accepted.', 403);
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new AppError('Cross-site requests are not accepted.', 403);
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new AppError('Send JSON input.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('Missing request body.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) {
      await reader.cancel();
      throw new AppError('Message is too large. Keep the submission under 12,000 characters.', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new AppError('The request body must be valid JSON.');
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: 'Check the message length, case identifier, and requested action.' },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        'Could not reach the investigation service. Start npm run dev, verify the model connection, and retry.',
    },
    { status: 503 },
  );
}
