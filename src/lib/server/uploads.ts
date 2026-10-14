import path from 'node:path';
import { ApiError, boundedBody } from './http';
import { documentKindSchema } from './validation';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export function detectMime(bytes: Buffer, claimed: string): string {
  if (!bytes.length) throw new ApiError(400, 'The selected file is empty.');
  if (bytes.length > MAX_FILE_BYTES) throw new ApiError(413, 'Maximum document size is 10 MB.');
  const pdf = bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (pdf && ['application/pdf', 'application/octet-stream', ''].includes(claimed)) return 'application/pdf';
  if (png && ['image/png', 'application/octet-stream', ''].includes(claimed)) return 'image/png';
  if (jpeg && ['image/jpeg', 'image/jpg', 'application/octet-stream', ''].includes(claimed)) return 'image/jpeg';
  if (claimed === 'text/plain') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw new Error('Binary content');
      if (/^\s*(?:<!doctype html|<html|<script|<svg)/i.test(text)) throw new Error('Active content');
      return 'text/plain';
    } catch { throw new ApiError(415, 'The file is not valid UTF-8 plain text.'); }
  }
  throw new ApiError(415, 'Upload a valid PDF, PNG, JPEG, or UTF-8 text file. The file type must match its contents.');
}

export async function parseUpload(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(415, 'Choose a document to upload.');
  const bytes = await boundedBody(request, MAX_FILE_BYTES + 128 * 1024);
  let form: FormData;
  try { form = await new Response(new Uint8Array(bytes), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData(); }
  catch { throw new ApiError(400, 'The upload could not be read. Choose the file again.'); }
  if ([...form.keys()].some(key => !['file', 'kind', 'consent'].includes(key))
    || form.getAll('consent').length !== 1 || form.getAll('kind').length !== 1) {
    throw new ApiError(400, 'The upload contains unsupported or repeated fields.');
  }
  if (form.get('consent') !== 'true') throw new ApiError(400, 'Confirm that you have permission to upload this document and consent to its processing.');
  const files = form.getAll('file');
  const file = files[0];
  if (files.length !== 1 || !file || typeof file === 'string') throw new ApiError(400, 'Upload one document at a time.');
  const kind = documentKindSchema.parse(form.get('kind'));
  const content = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMime(content, file.type);
  const name = path.basename(file.name.replace(/\\/g, '/')).replace(/[\r\n\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 180) || 'document';
  return { bytes: content, mimeType, name, kind };
}
