import { NextResponse } from 'next/server';
import { readCase } from '../../../../../../agent/cases';
import { errorResponse, guardRequest } from '../../http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardRequest(request);
    const { id } = await context.params;
    return NextResponse.json(await readCase(id));
  } catch (error) {
    return errorResponse(error);
  }
}
