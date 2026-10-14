import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError } from './http';

type Operation = 'extraction' | 'assistant';
type Stage = 'configuration' | 'request' | 'response' | 'parse' | 'validation' | 'evidence';
type Reason = 'not_configured' | 'quota' | 'authentication' | 'model_unavailable' | 'request_rejected'
  | 'service_unavailable' | 'timeout' | 'network' | 'empty_response' | 'truncated_response'
  | 'blocked_response' | 'invalid_json' | 'invalid_schema' | 'invalid_sources' | 'duplicate_fields' | 'unknown_failure';

export type AiDiagnosticContext = {
  operation: Operation;
  stage: Stage;
  finishReasons: string[];
  blockReason: string | null;
};

// Never serialize an error/response object or its free-text message, stack or URL.
// Every external string admitted to diagnostics must pass an exact allowlist.
const finishReasons = new Set(['FINISH_REASON_UNSPECIFIED', 'STOP', 'MAX_TOKENS', 'SAFETY', 'RECITATION',
  'LANGUAGE', 'OTHER', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'MALFORMED_FUNCTION_CALL',
  'IMAGE_SAFETY', 'UNEXPECTED_TOOL_CALL', 'IMAGE_PROHIBITED_CONTENT', 'NO_IMAGE', 'IMAGE_RECITATION', 'IMAGE_OTHER']);
const blockReasons = new Set(['BLOCKED_REASON_UNSPECIFIED', 'SAFETY', 'OTHER', 'BLOCKLIST',
  'PROHIBITED_CONTENT', 'IMAGE_SAFETY', 'MODEL_ARMOR', 'JAILBREAK']);
const blockedFinishes = new Set(['SAFETY', 'RECITATION', 'LANGUAGE', 'BLOCKLIST', 'PROHIBITED_CONTENT',
  'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'IMAGE_RECITATION']);
const networkCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID']);
const timeoutCodes = new Set(['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const pathNames = new Set(['fields', 'field', 'value', 'page', 'quote', 'confidence', 'notes', 'answer', 'sourceIds']);
const issueCodes = new Set(['invalid_type', 'invalid_literal', 'custom', 'invalid_union', 'invalid_union_discriminator',
  'invalid_enum_value', 'unrecognized_keys', 'invalid_arguments', 'invalid_return_type', 'invalid_date',
  'invalid_string', 'too_small', 'too_big', 'invalid_intersection_types', 'not_multiple_of', 'not_finite']);

function read(value: unknown, key: string): unknown {
  try { return value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined; }
  catch { return undefined; }
}
function allowed(value: unknown, choices: Set<string>): string {
  return typeof value === 'string' && choices.has(value) ? value : 'OTHER';
}
function providerStatus(error: unknown): number | null {
  for (const value of [read(error, 'status'), read(error, 'code')]) {
    const number = typeof value === 'string' && /^\d{3}$/.test(value) ? Number(value) : value;
    if (typeof number === 'number' && Number.isInteger(number) && number >= 100 && number <= 599) return number;
  }
  return null;
}
function networkFailure(error: unknown): { code: string | null; timedOut: boolean; network: boolean } {
  const seen = new Set<unknown>();
  let current = error;
  let code: string | null = null;
  let timedOut = false;
  let network = false;
  for (let depth = 0; current && depth < 4 && !seen.has(current); depth++) {
    seen.add(current);
    const candidate = read(current, 'code');
    if (typeof candidate === 'string' && networkCodes.has(candidate)) {
      code ??= candidate;
      timedOut ||= timeoutCodes.has(candidate);
      network = true;
    }
    const name = read(current, 'name');
    timedOut ||= name === 'TimeoutError' || name === 'AbortError';
    // The SDK may wrap fetch failures and discard their nested cause.
    // Do not guess "network" from arbitrary error-message text.
    current = read(current, 'cause');
  }
  return { code, timedOut, network };
}

export class AiResponseError extends Error {
  constructor(public readonly reason: Reason) { super(reason); }
}

export function startAiDiagnostic(operation: Operation): AiDiagnosticContext {
  return { operation, stage: 'configuration', finishReasons: [], blockReason: null };
}

export function readAiResponseText(context: AiDiagnosticContext, response: unknown): string {
  context.stage = 'response';
  const candidates = read(response, 'candidates');
  context.finishReasons = Array.isArray(candidates)
    ? candidates.slice(0, 8).map(candidate => allowed(read(candidate, 'finishReason'), finishReasons)) : [];
  const blockReason = read(read(response, 'promptFeedback'), 'blockReason');
  context.blockReason = blockReason === undefined || blockReason === null ? null : allowed(blockReason, blockReasons);
  const selectedFinish = context.finishReasons[0];
  if ((context.blockReason && context.blockReason !== 'BLOCKED_REASON_UNSPECIFIED')
    || blockedFinishes.has(selectedFinish)) throw new AiResponseError('blocked_response');
  if (selectedFinish === 'MAX_TOKENS') throw new AiResponseError('truncated_response');
  // Do not call the SDK's .text getter: its warnings can contain arbitrary
  // non-text part keys. Match its first-candidate, non-thought text behavior
  // without enumerating or logging provider-controlled properties.
  const parts = read(read(Array.isArray(candidates) ? candidates[0] : undefined, 'content'), 'parts');
  const text = Array.isArray(parts) ? parts.map(part => {
    if (read(part, 'thought') === true) return '';
    const value = read(part, 'text');
    return typeof value === 'string' ? value : '';
  }).join('') : '';
  if (!text.trim()) throw new AiResponseError('empty_response');
  return text;
}

const messages: Record<Reason, string> = {
  not_configured: 'Gemini is not configured. Check the server API-key setting.',
  quota: 'Gemini reported a quota or rate limit. Check available quota before retrying.',
  authentication: 'Gemini denied access. Check the API key, restrictions and model permissions.',
  model_unavailable: 'The configured model was not found or is unavailable to this project. Check model access.',
  request_rejected: 'Gemini rejected the request format or settings. Check the server diagnostic before retrying.',
  service_unavailable: 'Gemini reported a service error. Keep this failed attempt and try again later.',
  timeout: 'The request timed out. No usable result was returned.',
  network: 'The server could not complete the connection to Gemini. Check its network and certificate configuration.',
  empty_response: 'Gemini returned no usable text. Check the server diagnostic before retrying.',
  truncated_response: 'Gemini reached its response-token limit. The incomplete result was not accepted.',
  blocked_response: 'Gemini withheld a usable response. Check the server diagnostic; do not treat this as a document finding.',
  invalid_json: 'Gemini returned an invalid JSON response. No result was accepted.',
  invalid_schema: 'Gemini returned a response that failed format validation. No result was accepted.',
  invalid_sources: 'Gemini returned an unsupported evidence reference. No answer was accepted.',
  duplicate_fields: 'Gemini returned duplicate extracted fields. No extraction was accepted.',
  unknown_failure: 'The operation failed for an unclassified reason. Check the server diagnostic before retrying.',
};

export function aiFailure(error: unknown, context: AiDiagnosticContext): ApiError {
  const status = context.stage === 'request' ? providerStatus(error) : null;
  const network = context.stage === 'request' ? networkFailure(error) : { code: null, timedOut: false, network: false };
  let reason: Reason;
  if (error instanceof AiResponseError) reason = error.reason;
  else if (context.stage === 'validation' && error instanceof ZodError) reason = 'invalid_schema';
  else if (context.stage === 'parse' && error instanceof SyntaxError) reason = 'invalid_json';
  else if (status === 429) reason = 'quota';
  else if (status === 401 || status === 403) reason = 'authentication';
  else if (status === 404) reason = 'model_unavailable';
  else if (status === 408 || status === 504 || network.timedOut) reason = 'timeout';
  else if (status !== null && status >= 500) reason = 'service_unavailable';
  else if (status !== null && status >= 400) reason = 'request_rejected';
  else if (network.network) reason = 'network';
  else reason = 'unknown_failure';

  const reference = randomUUID();
  const validationIssues = error instanceof ZodError ? error.issues.slice(0, 8).map(issue => ({
    code: issueCodes.has(issue.code) ? issue.code : 'other',
    // Unknown keys and issue messages can contain model output. Never copy them.
    path: issue.path.slice(0, 8).map(part => typeof part === 'number' && Number.isInteger(part) && part >= 0 && part <= 10_000
      ? part : typeof part === 'string' && pathNames.has(part) ? part : '*'),
  })) : [];
  const diagnostic = {
    event: 'bhuverify.ai.failure', reference, operation: context.operation, stage: context.stage, reason,
    providerStatus: status, networkCode: network.code, finishReasons: context.finishReasons,
    blockReason: context.blockReason, validationIssues,
  };
  try { console.warn(JSON.stringify(diagnostic)); } catch { /* Logging must not replace the safe response. */ }
  const httpStatus = reason === 'quota' ? 429 : reason === 'timeout' ? 504
    : reason === 'service_unavailable' || reason === 'not_configured' ? 503 : 502;
  const operation = context.operation === 'assistant' ? 'assistant' : 'document extraction';
  return new ApiError(httpStatus, `Gemini ${operation} failed: ${messages[reason]} Reference: ${reference}.`);
}
