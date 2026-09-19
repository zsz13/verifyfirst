import { readFile } from 'node:fs/promises';
import { AppError, casePath } from '../../../../../../../agent/cases';
import { errorResponse, guardRequest } from '../../../http';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardRequest(request);
    const { id } = await context.params;
    const contents = await readFile(casePath(id, 'export.json'), 'utf8').catch(() => {
      throw new AppError('The report has not been approved and exported.', 403);
    });
    return new Response(contents, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="verifyfirst-${id}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
