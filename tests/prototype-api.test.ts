import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as assistantPost } from '../src/app/api/ai/assistant/route';
import { POST as extractPost } from '../src/app/api/ai/extract/route';
import { GET as configGet } from '../src/app/api/config/route';
import { answerQuestion } from '../src/lib/server/ai';
import { acquireAiSlot, AI_HARD_LIMITS, withAiSlot } from '../src/lib/server/ai-limits';
import { assertSameOrigin, boundedBody } from '../src/lib/server/http';
import { demoTemplates } from '../src/lib/demo';
import { analyzeCase } from '../src/lib/checks';
import type { PropertyCase } from '../src/lib/types';

const { generateContent, constructClient } = vi.hoisted(() => ({ generateContent: vi.fn(), constructClient: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
    constructor(options: unknown) { constructClient(options); }
  },
}));

const origin = 'https://prototype.example';
const key = 'FAKE_PRIVATE_KEY_FOR_OFFLINE_TESTS_ONLY';
const timestamp = '2026-10-11T09:00:00.000Z';

function property(): PropertyCase {
  return { ...structuredClone(demoTemplates[0].case), id: 'fictional-case', ownerId: 'browser', createdAt: timestamp, updatedAt: timestamp };
}
function snapshot() {
  const { ownerId: _ownerId, analysis: _analysis, ...data } = property();
  return data;
}
function payload() { return { case: snapshot(), question: 'What requires checking in this fictional case?', consent: true }; }
function request(body: unknown = payload(), requestOrigin: string | null = origin, extraHeaders: Record<string, string> = {}) {
  return new Request(`${origin}/api/ai/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(requestOrigin ? { Origin: requestOrigin } : {}), ...extraHeaders },
    body: JSON.stringify(body),
  });
}
function upload(content = 'Khesra: 0042', mimeType = 'text/plain', extra?: (form: FormData) => void) {
  const form = new FormData();
  form.set('file', new File([content], 'fictional-document.txt', { type: mimeType }));
  form.set('kind', 'sale_deed'); form.set('consent', 'true');
  extra?.(form);
  return new Request(`${origin}/api/ai/extract`, { method: 'POST', headers: { Origin: origin }, body: form });
}
function response(data: unknown) {
  return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }] };
}
const safeAnswer = { answer: 'The fictional supplied records require review. Official verification has not been performed.', sourceIds: [] };

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('APP_ORIGIN', origin);
  vi.stubEnv('BHUVERIFY_PREVIEW_HOST', '');
  vi.stubEnv('BHUVERIFY_AI_ENABLED', 'true');
  vi.stubEnv('GEMINI_API_KEY', key);
  vi.stubEnv('GEMINI_MODEL', 'offline-test-model');
  for (const name of ['CONCURRENT', 'MINUTE', 'HOUR', 'DAY']) vi.stubEnv(`BHUVERIFY_AI_LIMIT_${name}`, '');
  Reflect.deleteProperty(globalThis, '__bhuverifyPrototypeAiLimits');
  generateContent.mockReset().mockResolvedValue(response(safeAnswer));
  constructClient.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden in tests.'); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('anonymous AI routes', () => {
  it('reports browser persistence and AI availability without keys, cookies or Firebase settings', async () => {
    vi.stubEnv('BHUVERIFY_PERSISTENCE', 'firebase');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'unwanted-firebase-key');
    const result = await configGet();
    expect(await result.json()).toEqual({ persistence: 'browser', originalRetention: 'none', aiEnabled: true, model: 'offline-test-model', authRequired: false, firebase: null });
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(constructClient).not.toHaveBeenCalled();
  });

  it('answers from a bounded current-case snapshot and builds citations on the server', async () => {
    generateContent.mockResolvedValueOnce(response({ answer: 'This fictional evidence is supplied [1]. Official verification has not been performed.', sourceIds: [1] }));
    const result = await assistantPost(request());
    expect(result.status).toBe(200);
    const answer = await result.json();
    expect(answer.mode).toBe('gemini');
    expect(answer.sources[0]).toMatchObject({ id: 1, documentId: 'mismatch-deed' });
    expect(JSON.stringify(answer)).not.toContain(key);
    const input = JSON.parse(generateContent.mock.calls[0][0].contents);
    expect(input.findings).toEqual(analyzeCase(property()).findings);
    expect(input).not.toHaveProperty('ownerId');
    expect(input).not.toHaveProperty('apiKey');
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(constructClient).toHaveBeenCalledWith({ apiKey: key, httpOptions: { timeout: 90_000 } });
    expect(result.headers.get('set-cookie')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not trust caller analysis even when the internal helper is invoked directly', async () => {
    const forged = property();
    forged.analysis = { ...analyzeCase(forged), summary: 'FORGED: title is guaranteed', findings: [] };
    await answerQuestion(forged, 'Compare the records.');
    const sent = JSON.parse(generateContent.mock.calls[0][0].contents);
    expect(sent.findings.length).toBeGreaterThan(0);
    expect(JSON.stringify(sent)).not.toContain('FORGED');
  });

  it.each(['analysis', 'ownerId', 'apiKey'])('rejects unknown case field %s rather than trusting or forwarding it', async name => {
    const data = payload();
    Object.assign(data.case, { [name]: 'PRIVATE_UNTRUSTED_VALUE' });
    const result = await assistantPost(request(data));
    expect(result.status).toBe(400);
    expect(await result.text()).not.toContain('PRIVATE_UNTRUSTED_VALUE');
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects document storage keys, duplicate IDs and invalid field names', async () => {
    for (const mutate of [
      (data: ReturnType<typeof payload>) => Object.assign(data.case.documents[0], { storageKey: 'forged-other-account-object' }),
      (data: ReturnType<typeof payload>) => { data.case.documents[1].id = data.case.documents[0].id; },
      (data: ReturnType<typeof payload>) => Object.assign(data.case.documents[0].fields, { secretUnknown: { value: 'x', page: 1, quote: 'x', confidence: 'high' } }),
    ]) {
      const data = payload(); mutate(data);
      expect((await assistantPost(request(data))).status).toBe(400);
    }
    expect(generateContent).not.toHaveBeenCalled();
  });

  it.each([false, undefined, 'true'])('requires explicit boolean assistant processing consent (%s)', async consent => {
    expect((await assistantPost(request({ ...payload(), consent }))).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects oversized fields, excessive documents and oversized aggregate snapshots', async () => {
    const longField = payload(); longField.case.documents[0].fields.khata!.value = 'a'.repeat(1001);
    expect((await assistantPost(request(longField))).status).toBe(400);
    const manyDocs = payload();
    manyDocs.case.documents = Array.from({ length: 21 }, (_, i) => ({ ...structuredClone(manyDocs.case.documents[0]), id: `doc-${i}` }));
    expect((await assistantPost(request(manyDocs))).status).toBe(400);
    const aggregate = payload();
    aggregate.case.documents = Array.from({ length: 20 }, (_, i) => {
      const doc = structuredClone(aggregate.case.documents[0]); doc.id = `doc-${i}`;
      for (const field of Object.values(doc.fields)) if (field) { field.quote = 'q'.repeat(2000); field.value = 'v'.repeat(1000); }
      return doc;
    });
    expect((await assistantPost(request(aggregate))).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects a streamed JSON body over 1 MiB without trusting Content-Length', async () => {
    const huge = new Request(`${origin}/api/ai/assistant`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: 'x'.repeat(1024 * 1024 + 1) });
    expect((await assistantPost(huge)).status).toBe(413);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('validates JSON content type and syntax without reflecting malformed content', async () => {
    expect((await assistantPost(request(payload(), origin, { 'Content-Type': 'text/plain' }))).status).toBe(415);
    const malformed = new Request(`${origin}/api/ai/assistant`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{PRIVATE_MALFORMED_INPUT' });
    const result = await assistantPost(malformed);
    expect(result.status).toBe(400); expect(await result.text()).not.toContain('PRIVATE_MALFORMED_INPUT');
  });

  it('uses only the submitted case for source metadata, never an earlier visitor’s case', async () => {
    generateContent.mockResolvedValue(response({ answer: 'Submitted source [1].', sourceIds: [1] }));
    await assistantPost(request());
    const second = payload(); second.case.documents[0].id = 'other-browser-document'; second.case.documents[0].name = 'Second fictional visitor.txt';
    const result = await assistantPost(request(second));
    const answer = await result.json();
    expect(answer.sources[0].documentId).toBe('other-browser-document');
    expect(answer.sources[0].documentName).toBe('Second fictional visitor.txt');
  });

  it.each(['disabled', 'missing'])('makes no provider call when AI is %s', async mode => {
    if (mode === 'disabled') vi.stubEnv('BHUVERIFY_AI_ENABLED', 'false');
    else vi.stubEnv('GEMINI_API_KEY', '');
    expect((await assistantPost(request())).status).toBe(503);
    expect((await extractPost(upload())).status).toBe(503);
    expect(constructClient).not.toHaveBeenCalled(); expect(generateContent).not.toHaveBeenCalled();
  });

  it('sanitizes provider failures and returns an actionable error instead of a fake AI result', async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error(`PRIVATE_DOCUMENT ${key}`), { status: 403 }));
    const result = await assistantPost(request());
    expect(result.status).toBe(502);
    const text = await result.text();
    expect(text).toContain('Gemini denied access'); expect(text).not.toContain(key); expect(text).not.toContain('PRIVATE_DOCUMENT');
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(key);
  });

  it('keeps extraction inline and validates quoted plain-text evidence', async () => {
    generateContent.mockResolvedValueOnce(response({ fields: [
      { field: 'khesra', value: '0042', quote: 'Khesra: 0042', page: 1, confidence: 'high' },
      { field: 'seller', value: 'Invented name', quote: 'Not in submitted document', page: 1, confidence: 'high' },
    ], notes: [] }));
    const result = await extractPost(upload());
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.fields.khesra.value).toBe('0042'); expect(data.fields).not.toHaveProperty('seller');
    expect(data.notes.join(' ')).toContain('require your review');
    const sent = generateContent.mock.calls[0][0];
    expect(sent.contents[0].parts[1].text).toContain('Khesra: 0042');
    expect(JSON.stringify(sent)).not.toContain('fileUri');
    expect(result.headers.get('set-cookie')).toBeNull();
  });

  it('validates multipart shape, permission and file contents before calling Gemini', async () => {
    expect((await extractPost(upload('text', 'text/plain', form => form.delete('consent')))).status).toBe(400);
    expect((await extractPost(upload('text', 'text/plain', form => form.set('apiKey', 'not-accepted')))).status).toBe(400);
    expect((await extractPost(upload('text', 'text/plain', form => form.append('kind', 'map')))).status).toBe(400);
    expect((await extractPost(upload('text pretending to be a PDF', 'application/pdf'))).status).toBe(415);
    expect((await extractPost(upload('<script>bad</script>', 'text/plain'))).status).toBe(415);
    expect((await extractPost(upload('', 'text/plain'))).status).toBe(400);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rejects an oversized declared body before trying to read or contact Gemini', async () => {
    const oversized = new Request(`${origin}/api/ai/extract`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'multipart/form-data; boundary=test', 'Content-Length': String(12 * 1024 * 1024) }, body: 'x' });
    expect((await extractPost(oversized)).status).toBe(413);
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('exact-origin checks', () => {
  it.each([null, 'null', 'https://attacker.example', `${origin}.attacker.example`, `${origin}/path`])('rejects origin %s', async value => {
    expect((await assistantPost(request(payload(), value))).status).toBe(403);
    expect(generateContent).not.toHaveBeenCalled();
  });
  it('requires a configured valid APP_ORIGIN in production and does not trust forwarded headers', async () => {
    vi.stubEnv('APP_ORIGIN', '');
    expect((await assistantPost(request())).status).toBe(503);
    vi.stubEnv('APP_ORIGIN', 'https://prototype.example/path');
    expect((await assistantPost(request())).status).toBe(503);
    vi.stubEnv('APP_ORIGIN', origin);
    expect((await assistantPost(request(payload(), 'https://attacker.example', { 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' }))).status).toBe(403);
  });
  it('rejects a cross-site Fetch Metadata request even if the Origin was otherwise allowed', async () => {
    expect((await assistantPost(request(payload(), origin, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
  });
  it('permits only explicit preview hosts and loopback aliases on matching ports in development', () => {
    vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('APP_ORIGIN', '');
    const local = (value: string) => new Request('http://localhost:3000/api/ai/assistant', { method: 'POST', headers: { Origin: value } });
    expect(() => assertSameOrigin(local('http://127.0.0.1:3000'))).not.toThrow();
    expect(() => assertSameOrigin(local('http://127.0.0.1:3001'))).toThrow();
    vi.stubEnv('BHUVERIFY_PREVIEW_HOST', 'specific-preview.run.app');
    expect(() => assertSameOrigin(local('https://specific-preview.run.app'))).not.toThrow();
    expect(() => assertSameOrigin(local('https://another-preview.run.app'))).toThrow();
    vi.stubEnv('BHUVERIFY_PREVIEW_HOST', 'ais-dev-w753f6njoxvngeq4t2fmeu-681738775066.asia-southeast1.run.app');
    expect(() => assertSameOrigin(local('https://ais-dev-w753f6njoxvngeq4t2fmeu-681738775066.asia-southeast1.run.app'))).not.toThrow();
    expect(() => assertSameOrigin(local('https://another-preview.asia-southeast1.run.app'))).toThrow();
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('APP_ORIGIN', origin);
    expect(() => assertSameOrigin(local('https://specific-preview.run.app'))).toThrow();
    expect(() => assertSameOrigin(local('https://ais-dev-w753f6njoxvngeq4t2fmeu-681738775066.asia-southeast1.run.app'))).toThrow();
  });
});

describe('anonymous request cost guards', () => {
  it('shares a concurrency cap across the extraction and assistant routes and releases it after failure', async () => {
    const pending: Array<(value: unknown) => void> = [];
    generateContent.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const first = assistantPost(request()), second = extractPost(upload());
    await vi.waitFor(() => expect(generateContent).toHaveBeenCalledTimes(2));
    expect((await assistantPost(request())).status).toBe(429);
    pending[0](response(safeAnswer)); pending[1]({ candidates: [] });
    expect((await first).status).toBe(200); expect((await second).status).toBe(502);
    generateContent.mockResolvedValue(response(safeAnswer));
    expect((await assistantPost(request())).status).toBe(200);
  });
  it('counts attempts against a shared minute budget without taking an IP from spoofable headers', async () => {
    vi.stubEnv('BHUVERIFY_AI_LIMIT_MINUTE', '2');
    expect((await assistantPost(request())).status).toBe(200);
    expect((await assistantPost(request())).status).toBe(200);
    expect((await assistantPost(request(payload(), origin, { 'x-forwarded-for': '203.0.113.123' }))).status).toBe(429);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
  it.each(['0', '-1', 'Infinity', '99999'])('does not allow setting %s to disable or raise hard caps', setting => {
    vi.stubEnv('BHUVERIFY_AI_LIMIT_MINUTE', setting);
    for (let i = 0; i < AI_HARD_LIMITS.minute; i++) acquireAiSlot()();
    expect(() => acquireAiSlot()).toThrow('minute limit');
  });
  it('enforces hourly and daily caps even when the minute window has expired', () => {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubEnv('BHUVERIFY_AI_LIMIT_HOUR', '2');
    acquireAiSlot()(); now += 61_000; acquireAiSlot()(); now += 61_000;
    expect(() => acquireAiSlot()).toThrow('hour limit');
    Reflect.deleteProperty(globalThis, '__bhuverifyPrototypeAiLimits');
    vi.stubEnv('BHUVERIFY_AI_LIMIT_DAY', '2');
    acquireAiSlot()(); now += 3_600_001; acquireAiSlot()(); now += 3_600_001;
    expect(() => acquireAiSlot()).toThrow('day limit');
  });
  it('releases slots once and in finally when an operation rejects or times out', async () => {
    const release = acquireAiSlot(); release(); release();
    await expect(withAiSlot(() => Promise.reject(new DOMException('Timed out', 'TimeoutError')))).rejects.toThrow('Timed out');
    const first = acquireAiSlot(), second = acquireAiSlot();
    expect(() => acquireAiSlot()).toThrow('processing other');
    first(); second();
    expect(() => acquireAiSlot()()).not.toThrow();
  });
  it('cancels oversized streams even if a misleading small length was declared', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100)); }, cancel });
    const streamRequest = new Request(`${origin}/api/ai/assistant`, { method: 'POST', headers: { 'Content-Length': '1' }, body: stream, duplex: 'half' } as RequestInit);
    await expect(boundedBody(streamRequest, 10)).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
