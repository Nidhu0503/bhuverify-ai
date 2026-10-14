import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import { answerQuestion, extractDocument } from '../src/lib/server/ai';
import { ApiError } from '../src/lib/server/http';
import { demoTemplates } from '../src/lib/demo';
import type { PropertyCase } from '../src/lib/types';

const { generateContent, constructClient } = vi.hoisted(() => ({
  generateContent: vi.fn(), constructClient: vi.fn(),
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor() { constructClient(); }
  },
}));

// Deliberately recognizable fake secrets: neither a diagnostic nor a public
// error should contain any of these, even when the provider echoes them.
const privateValues = {
  key: 'PRIVATE_TEST_KEY_DO_NOT_LOG',
  model: 'PRIVATE_TEST_MODEL_DO_NOT_LOG',
  question: 'PRIVATE_TEST_QUESTION_DO_NOT_LOG',
  caseId: 'PRIVATE_TEST_CASE_DO_NOT_LOG',
  document: 'PRIVATE_TEST_DOCUMENT_DO_NOT_LOG',
  response: 'PRIVATE_TEST_RESPONSE_DO_NOT_LOG',
  metadata: 'PRIVATE_TEST_METADATA_DO_NOT_LOG',
  unknownKey: 'PRIVATE_TEST_UNKNOWN_KEY_DO_NOT_LOG',
  url: 'https://private-test.invalid/?key=PRIVATE_TEST_KEY_DO_NOT_LOG',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Operation = 'extraction' | 'assistant';
type Diagnostic = {
  event: string; reference: string; operation: Operation; stage: string; reason: string;
  providerStatus: number | null; networkCode: string | null;
  finishReasons: string[]; blockReason: string | null;
  validationIssues: { code: string; path: unknown }[];
};

function property(): PropertyCase {
  const result: PropertyCase = {
    ...structuredClone(demoTemplates[0].case),
    id: privateValues.caseId, ownerId: 'test-owner', createdAt: '', updatedAt: '',
  };
  result.documents[0].name = privateValues.document;
  return result;
}

function invoke(operation: Operation) {
  return operation === 'assistant'
    ? answerQuestion(property(), privateValues.question)
    : extractDocument(Buffer.from(`Khesra: 0042\n${privateValues.document}`), 'text/plain', 'sale_deed');
}

function providerFailure(status?: number, code: unknown = privateValues.metadata) {
  return Object.assign(new Error(Object.values(privateValues).join(' ')), {
    name: privateValues.metadata, status, code,
    stack: privateValues.response,
    response: { body: privateValues.document, url: privateValues.url },
  });
}

function sdkResponse(text: string, finishReason = 'STOP') {
  return { candidates: [{ finishReason, content: { parts: [{ text }] } }] };
}

let warning: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('BHUVERIFY_PERSISTENCE', 'local');
  vi.stubEnv('GEMINI_API_KEY', privateValues.key);
  vi.stubEnv('GEMINI_MODEL', privateValues.model);
  generateContent.mockReset();
  constructClient.mockReset();
  warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function expectFailure(operation: Operation, stage: string, expected: Partial<Diagnostic> = {}) {
  const error = await invoke(operation).then(
    () => { throw new Error('Expected this mocked request to fail.'); },
    failure => failure as ApiError,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect(warning).toHaveBeenCalledTimes(1);
  // Only one serialized allowlisted record; never pass a raw error object as
  // an extra argument for the logger to inspect or serialize.
  expect(warning.mock.calls[0]).toHaveLength(1);
  expect(typeof warning.mock.calls[0][0]).toBe('string');
  const diagnostic = JSON.parse(warning.mock.calls[0][0] as string) as Diagnostic;
  expect(Object.keys(diagnostic).sort()).toEqual([
    'event', 'reference', 'operation', 'stage', 'reason', 'providerStatus',
    'networkCode', 'finishReasons', 'blockReason', 'validationIssues',
  ].sort());
  expect(diagnostic).toMatchObject({ event: 'bhuverify.ai.failure', operation, stage, ...expected });
  expect(diagnostic.reference).toMatch(uuid);
  expect(error.message).toContain(`Reference: ${diagnostic.reference}.`);
  expect(error.message).toMatch(operation === 'assistant' ? /assistant|question/i : /document|extract/i);
  if (operation === 'assistant') expect(error.message).not.toMatch(/clearer scan|review.*manually/i);
  const output = JSON.stringify(warning.mock.calls) + error.message;
  for (const value of Object.values(privateValues)) expect(output).not.toContain(value);
  for (const issue of diagnostic.validationIssues) {
    expect(Object.keys(issue).sort()).toEqual(['code', 'path']);
    expect(issue).not.toHaveProperty('message');
    expect(issue).not.toHaveProperty('received');
    expect(issue).not.toHaveProperty('keys');
    expect(Array.isArray(issue.path)).toBe(true);
  }
  return { error, diagnostic };
}

describe('privacy-safe Gemini request diagnostics', () => {
  it.each(['assistant', 'extraction'] as const)('sanitizes %s provider errors without retrying', async operation => {
    generateContent.mockRejectedValueOnce(providerFailure(503));
    const { error } = await expectFailure(operation, 'request', { providerStatus: 503, networkCode: null, reason: 'service_unavailable' });
    expect(error.status).toBe(503);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, 'request_rejected'], [401, 'authentication'], [403, 'authentication'],
    [404, 'model_unavailable'], [429, 'quota'], [500, 'service_unavailable'],
  ] as const)('records numeric provider status %i without its raw details', async (status, reason) => {
    generateContent.mockRejectedValueOnce(providerFailure(status));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: status, networkCode: null, reason });
    expect(error.status).toBe(status === 429 ? 429 : status >= 500 ? 503 : 502);
  });

  it('captures an allowlisted network code from a nested cause', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(providerFailure(), { cause: { code: 'ETIMEDOUT', message: privateValues.response } }));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: null, networkCode: 'ETIMEDOUT', reason: 'timeout' });
    expect(error.status).toBe(504);
  });

  it('does not interpret an arbitrary error name, code or message as diagnostic metadata', async () => {
    generateContent.mockRejectedValueOnce(providerFailure());
    await expectFailure('assistant', 'request', { providerStatus: null, networkCode: null, reason: 'unknown_failure' });
  });

  it('uses a numeric SDK error code when no status is present', async () => {
    generateContent.mockRejectedValueOnce(providerFailure(undefined, 429));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: 429, reason: 'quota' });
    expect(error.status).toBe(429);
  });

  it('accepts a three-digit HTTP status string without copying other provider strings', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(providerFailure(), { status: '429' }));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: 429, reason: 'quota' });
    expect(error.status).toBe(429);
  });

  it('replaces unexpected validation-path segments and omits issue messages', async () => {
    const error = new ZodError([{
      code: 'custom', path: ['fields', privateValues.unknownKey, 42, -1, 10001], message: privateValues.response,
    }]);
    generateContent.mockRejectedValueOnce(Object.assign(error, { status: 400 }));
    await expectFailure('assistant', 'request', {
      reason: 'request_rejected', providerStatus: 400,
      validationIssues: [{ code: 'custom', path: ['fields', '*', 42, '*', '*'] }],
    });
  });

  it('reports a known connection error with no provider HTTP status', async () => {
    generateContent.mockRejectedValueOnce(providerFailure(undefined, 'ECONNRESET'));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: null, networkCode: 'ECONNRESET', reason: 'network' });
    expect(error.status).toBe(502);
  });

  it('does not replace a sanitized error if writing its diagnostic fails', async () => {
    warning.mockImplementationOnce(() => { throw new Error(privateValues.response); });
    generateContent.mockRejectedValueOnce(providerFailure(429));
    const { error } = await expectFailure('assistant', 'request', { providerStatus: 429, reason: 'quota' });
    expect(error.status).toBe(429);
  });

  it('sanitizes client-construction failures before any request is sent', async () => {
    constructClient.mockImplementationOnce(() => { throw providerFailure(); });
    await expectFailure('extraction', 'configuration', { providerStatus: null });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('adds a reference for extraction without a configured key', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const { error } = await expectFailure('extraction', 'configuration', { providerStatus: null, reason: 'not_configured' });
    expect(error.status).toBe(503);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('response, parsing and evidence stages', () => {
  it('reports a missing response body rather than a schema or scan error', async () => {
    generateContent.mockResolvedValueOnce({ candidates: [], responseId: privateValues.metadata });
    await expectFailure('assistant', 'response', { providerStatus: null, reason: 'empty_response' });
  });

  it('keeps a known truncation finish reason without leaking candidate content', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ finishReason: 'MAX_TOKENS', finishMessage: privateValues.metadata, content: { parts: [{ text: `{"answer":"${privateValues.response}` }] } }],
    });
    await expectFailure('assistant', 'response', { finishReasons: ['MAX_TOKENS'], reason: 'truncated_response' });
  });

  it('captures an allowlisted safety block without its explanatory text', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ finishReason: 'SAFETY', finishMessage: privateValues.metadata }],
      promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: privateValues.response },
    });
    await expectFailure('assistant', 'response', { finishReasons: ['SAFETY'], blockReason: 'SAFETY', reason: 'blocked_response' });
  });

  it('omits unknown finish and block reason values from logs', async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [{ finishReason: privateValues.metadata }],
      promptFeedback: { blockReason: privateValues.response },
    });
    await expectFailure('assistant', 'response', { finishReasons: ['OTHER'], blockReason: 'OTHER' });
  });

  it('classifies invalid JSON without logging response text or parser excerpts', async () => {
    generateContent.mockResolvedValueOnce(sdkResponse(privateValues.response));
    await expectFailure('assistant', 'parse', { finishReasons: ['STOP'], validationIssues: [], reason: 'invalid_json' });
  });

  it('records only sanitized schema issue codes and paths for an assistant response', async () => {
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({
      answer: 7, sourceIds: privateValues.response, [privateValues.unknownKey]: privateValues.response,
    })));
    const { diagnostic } = await expectFailure('assistant', 'validation', { reason: 'invalid_schema' });
    expect(diagnostic.validationIssues.length).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostic.validationIssues)).toContain('answer');
  });

  it('sanitizes nested extraction schema issues and unexpected property names', async () => {
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ fields: [{
      field: privateValues.response, value: 99, quote: privateValues.document,
      page: 'not a page', confidence: privateValues.metadata, [privateValues.unknownKey]: privateValues.response,
    }], notes: [] })));
    const { diagnostic } = await expectFailure('extraction', 'validation', { reason: 'invalid_schema' });
    expect(diagnostic.validationIssues.length).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostic.validationIssues)).toContain('fields');
  });

  it('reports unsupported evidence IDs without emitting the generated answer', async () => {
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ answer: privateValues.response, sourceIds: [999999] })));
    await expectFailure('assistant', 'evidence', { reason: 'invalid_sources' });
  });

  it('reports duplicate extracted fields without emitting field values or quotes', async () => {
    const field = { field: 'khesra', value: '0042', quote: 'Khesra: 0042', page: 1, confidence: 'high' };
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ fields: [field, field], notes: [privateValues.response] })));
    await expectFailure('extraction', 'evidence', { reason: 'duplicate_fields' });
  });
});

describe('successful and offline behavior remains unchanged', () => {
  it('reads first-candidate text parts without invoking the SDK text getter or logging unknown part keys', async () => {
    const { GenerateContentResponse, FinishReason } = await vi.importActual<typeof import('@google/genai')>('@google/genai');
    const response = new GenerateContentResponse();
    const expectedAnswer = 'Fictional evidence only. Official verification has not been performed.';
    const json = JSON.stringify({ answer: expectedAnswer, sourceIds: [1] });
    response.candidates = [
      {
        finishReason: FinishReason.STOP,
        content: { parts: [
          { thought: true, text: privateValues.response },
          { text: json.slice(0, 20) },
          { [privateValues.unknownKey]: privateValues.document } as never,
          { functionCall: { name: privateValues.metadata, args: { secret: privateValues.key } } },
          { text: json.slice(20) },
        ] },
      },
      // Only the selected first candidate determines usable text and completion.
      { finishReason: FinishReason.MAX_TOKENS, content: { parts: [{ text: privateValues.response }] } },
    ];
    const textGetter = vi.spyOn(response, 'text', 'get').mockImplementation(() => {
      console.warn(privateValues.unknownKey);
      throw new Error(privateValues.response);
    });
    generateContent.mockResolvedValueOnce(response);
    const result = await answerQuestion(property(), 'What does this fictional case show?');
    expect(result.answer).toBe(expectedAnswer);
    expect(result.sources).toHaveLength(1);
    expect(result.mode).toBe('gemini');
    expect(textGetter).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to thought text or a later candidate when the first candidate has no answer text', async () => {
    const response = {
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ thought: true, text: privateValues.response }] } },
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'Do not use a later candidate.', sourceIds: [] }) }] } },
      ],
      get text() { console.warn(privateValues.unknownKey); return privateValues.response; },
    };
    const textGetter = vi.spyOn(response, 'text', 'get');
    generateContent.mockResolvedValueOnce(response);
    await expectFailure('assistant', 'response', { reason: 'empty_response', finishReasons: ['STOP', 'STOP'] });
    expect(textGetter).not.toHaveBeenCalled();
  });

  it('returns the original successful extraction without diagnostics', async () => {
    const field = { field: 'khesra', value: '0042', quote: 'Khesra: 0042', page: 1, confidence: 'high' };
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ fields: [field], notes: [] })));
    const result = await extractDocument(Buffer.from('Khesra: 0042'), 'text/plain', 'sale_deed');
    expect(result.fields.khesra).toEqual({ value: '0042', quote: 'Khesra: 0042', page: 1, confidence: 'high' });
    expect(result.notes).toContain('AI-extracted fields require your review against the original. This is not an official-record verification.');
    expect(warning).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ temperature: 0, maxOutputTokens: 6000 });
  });

  it('returns supported assistant evidence without diagnostics', async () => {
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ answer: 'Fictional evidence only. Official verification has not been performed.', sourceIds: [1] })));
    const result = await answerQuestion(property(), 'What does this fictional case show?');
    expect(result.mode).toBe('gemini');
    expect(result.sources).toHaveLength(1);
    expect(warning).not.toHaveBeenCalled();
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ temperature: 0.1, maxOutputTokens: 3000 });
  });

  it.each(['gemini-3.8-flash', 'models/gemini-3.8-flash', 'gemini-3.6-flash'])('uses supported low-latency defaults for %s without relaxing validation', async (model) => {
    vi.stubEnv('GEMINI_MODEL', model);
    const field = { field: 'khesra', value: '0042', quote: 'Khesra: 0042', page: 1, confidence: 'high' };
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ fields: [field], notes: [] })));
    const extracted = await extractDocument(Buffer.from('Khesra: 0042'), 'text/plain', 'sale_deed');
    expect(extracted.fields.khesra?.value).toBe('0042');
    expect(generateContent.mock.calls[0][0].config).toMatchObject({ thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 6000 });
    expect(generateContent.mock.calls[0][0].config).not.toHaveProperty('temperature');
    generateContent.mockResolvedValueOnce(sdkResponse(JSON.stringify({ answer: 'Fictional evidence only.', sourceIds: [1] })));
    const answered = await answerQuestion(property(), 'What does this fictional case show?');
    expect(answered.mode).toBe('gemini');
    expect(answered.sources).toHaveLength(1);
    expect(generateContent.mock.calls[1][0].config).toMatchObject({ thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 3000 });
    expect(generateContent.mock.calls[1][0].config).not.toHaveProperty('temperature');
    expect(warning).not.toHaveBeenCalled();
  });

  it('keeps the labeled offline preview without logging a failure or contacting Gemini', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const result = await answerQuestion(property(), 'What does this fictional case show?');
    expect(result.mode).toBe('demo');
    expect(result.answer).toContain('Gemini is not connected');
    expect(result.sources).toEqual([]);
    expect(warning).not.toHaveBeenCalled();
    expect(constructClient).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
  });
});
