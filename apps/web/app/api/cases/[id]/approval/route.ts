import { NextResponse } from 'next/server';
import { approveCase } from '../../../../../../../agent/cases';
import { errorResponse, guardRequest, jsonBody } from '../../../http';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    guardRequest(request);
    const { id } = await context.params;
    return NextResponse.json(await approveCase(id, await jsonBody(request)), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
