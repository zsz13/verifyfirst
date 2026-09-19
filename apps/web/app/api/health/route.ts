import { NextResponse } from 'next/server';
import { health } from '../../../../../agent/cases';
import { errorResponse, guardRequest } from '../http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    guardRequest(request);
    return NextResponse.json(await health());
  } catch (error) {
    return errorResponse(error);
  }
}
