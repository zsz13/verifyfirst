import { NextResponse } from 'next/server';
import { createCase } from '../../../../../agent/cases';
import { errorResponse, guardRequest, jsonBody } from '../http';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardRequest(request);
    return NextResponse.json(await createCase(await jsonBody(request)), { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
