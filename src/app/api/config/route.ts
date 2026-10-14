import { NextResponse } from 'next/server';
import { runtimeConfig } from '@/lib/server/config';
import { errorResponse, responseHeaders } from '@/lib/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return NextResponse.json(runtimeConfig(), { headers: responseHeaders() }); }
  catch (error) { return errorResponse(error); }
}
