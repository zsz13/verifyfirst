import { readFile } from 'node:fs/promises';
import { AppError, casePath } from '../../../../../../../agent/cases';
import { renderReportHtml } from '../../../../../../../agent/report-html';
import { reportSchema } from '../../../../../../../agent/types';
import { errorResponse, guardRequest } from '../../../http';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardRequest(request);
    const { id } = await context.params;
    const contents = await readFile(casePath(id, 'export.json'), 'utf8').catch(() => {
      throw new AppError('The report has not been approved and exported.', 403);
    });
    if (new URL(request.url).searchParams.get('format') === 'html') {
      const report = reportSchema.parse(JSON.parse(contents));
      return new Response(renderReportHtml(report), {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy':
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    return new Response(contents, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="verifyfirst-${id}.json"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
