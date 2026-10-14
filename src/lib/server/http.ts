import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function exactOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const candidate = value.trim().replace(/\/$/, '');
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === candidate ? candidate : null;
  } catch { return null; }
}

/** CSRF protection, not authentication. Non-browser callers can forge Origin. */
export function assertSameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const production = process.env.NODE_ENV === 'production';
  const configured = process.env.APP_ORIGIN?.trim();
  const expected = exactOrigin(configured);
  if ((configured && !expected) || (production && !expected)) {
    throw new ApiError(503, 'AI requests are unavailable: set APP_ORIGIN to this app’s exact public origin on the server.');
  }
  const origin = request.headers.get('origin');
  if (!origin || exactOrigin(origin) !== origin) throw new ApiError(403, 'This action must come from the BhuVerify app.');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'This action must come from the BhuVerify app.');
  if (expected && origin === expected) return;
  if (!production) {
    const requestOrigin = new URL(request.url).origin;
    // Next dev can normalize localhost. Permit aliases only on the same port and
    // protocol. Never infer an allowed origin from forwarded headers.
    if (!expected) {
      if (origin === requestOrigin) return;
      const actual = new URL(origin), target = new URL(requestOrigin);
      const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
      if (loopback.has(actual.hostname) && loopback.has(target.hostname)
        && actual.protocol === target.protocol && actual.port === target.port) return;
    }
    const previewHost = process.env.BHUVERIFY_PREVIEW_HOST?.trim();
    const previewOrigin = previewHost ? exactOrigin(`https://${previewHost}`) : null;
    if (previewOrigin && origin === previewOrigin) return;
  }
  throw new ApiError(403, 'This action must come from the BhuVerify app.');
}

export function errorResponse(error: unknown): Response {
  const status = error instanceof ApiError ? error.status : error instanceof ZodError ? 400 : 503;
  // Validation messages/paths can echo arbitrary keys or values from input.
  const message = error instanceof ApiError ? error.message : error instanceof ZodError
    ? 'Invalid input. Check the case fields, document limits, question and processing consent.'
    : 'The service is unavailable or not configured. Check server configuration and try again.';
  return NextResponse.json({ error: message }, { status, headers: responseHeaders() });
}

export function responseHeaders() {
  return { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
}

/** Content-Length is only an early hint: the streaming byte count is authoritative. */
export async function boundedBody(request: Request, maxBytes: number): Promise<Buffer> {
  const header = request.headers.get('content-length');
  if (header && (!/^\d+$/.test(header) || Number(header) > maxBytes)) throw new ApiError(413, 'Request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new ApiError(413, 'Request is too large.'); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}

export async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError(415, 'Send JSON for this action.');
  const bytes = await boundedBody(request, 1024 * 1024);
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new ApiError(400, 'The request contains invalid JSON.'); }
}
