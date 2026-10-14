import { NextResponse } from 'next/server';
import { extractDocument } from '@/lib/server/ai';
import { withAiSlot } from '@/lib/server/ai-limits';
import { assertSameOrigin, errorResponse, responseHeaders } from '@/lib/server/http';
import { parseUpload } from '@/lib/server/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const upload = await parseUpload(request);
    const result = await withAiSlot(() => extractDocument(upload.bytes, upload.mimeType, upload.kind, request.signal));
    // Inline provider request only. No Files API, database, cookies or disk writes.
    return NextResponse.json(result, { headers: responseHeaders() });
  } catch (error) { return errorResponse(error); }
}
