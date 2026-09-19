import { GET as approvedExport } from '../export/route';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  // Give the browser a distinct document URL while sharing the exact export gate.
  const url = new URL(request.url);
  url.searchParams.set('format', 'html');
  return approvedExport(new Request(url, request), context);
}
