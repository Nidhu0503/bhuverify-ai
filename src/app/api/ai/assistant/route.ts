import { NextResponse } from 'next/server';
import { answerQuestion } from '@/lib/server/ai';
import { withAiSlot } from '@/lib/server/ai-limits';
import { assertSameOrigin, errorResponse, jsonBody, responseHeaders } from '@/lib/server/http';
import { assistantRequestSchema } from '@/lib/server/validation';
import type { PropertyCase } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const input = assistantRequestSchema.parse(await jsonBody(request));
    // Internal compatibility value, not an account or ownership boundary. No case
    // lookup occurs: only this validated submitted snapshot is processed.
    const property: PropertyCase = { ...input.case, ownerId: 'anonymous-browser', analysis: null };
    const result = await withAiSlot(() => answerQuestion(property, input.question, request.signal));
    return NextResponse.json(result, { headers: responseHeaders() });
  } catch (error) { return errorResponse(error); }
}
