import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_REQUEST_TIMEOUT_MS, createBrowserDemoWorkspace, DemoError } from '../src/lib/browser-demo';
import { createMemoryWorkspaceStore } from '../src/lib/browser-store';
import type { PropertyCase, PropertyDocument } from '../src/lib/types';

const config = { persistence: 'browser', originalRetention: 'none', authRequired: false, firebase: null, aiEnabled: true, model: 'offline-test' };
const privateMarker = 'PRIVATE_RESPONSE_CONTENT_MUST_NOT_APPEAR';
const json = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) });
type ResponseFactory = (options: RequestInit) => Response | Promise<Response>;

async function setup(respond: ResponseFactory) {
  const request = vi.fn(async (path: RequestInfo | URL, options?: RequestInit) => {
    if (path === '/api/config') return Response.json(config);
    if (path === '/api/ai/assistant' || path === '/api/ai/extract') return respond(options ?? {});
    throw new Error('Unexpected mocked request');
  });
  const workspace = createBrowserDemoWorkspace({ store: createMemoryWorkspaceStore(), request });
  const { case: property } = await workspace.api<{ case: PropertyCase }>('/api/cases', json({ title: 'Fictional response test', state: 'BR' }));
  const ask = (signal?: AbortSignal) => workspace.api(`/api/cases/${property.id}/assistant`, {
    ...json({ question: 'What does this fictional case contain?', consent: true }), signal,
  });
  return { workspace, request, property, ask };
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live requests are forbidden in this suite'); })); });
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('safe remote response errors', () => {
  it.each([
    { label: 'HTML gateway error', status: 502, contentType: 'text/html', body: `<html>${privateMarker}</html>` },
    { label: 'empty service error', status: 503, contentType: 'application/json', body: '' },
    { label: 'malformed JSON error', status: 502, contentType: 'application/json', body: `{"${privateMarker}` },
    { label: 'HTML missing route', status: 404, contentType: 'text/html', body: `<html>${privateMarker}</html>` },
    { label: 'HTML success page', status: 200, contentType: 'text/html', body: `<html>${privateMarker}</html>` },
    { label: 'malformed JSON success', status: 200, contentType: 'application/json', body: `{"${privateMarker}` },
  ])('distinguishes $label from a connection failure without exposing its body', async ({ status, contentType, body }) => {
    const { ask, request } = await setup(() => new Response(body, { status, headers: { 'Content-Type': contentType } }));
    const error = await ask().catch(error => error);
    expect(error).toBeInstanceOf(DemoError);
    if (!(error instanceof DemoError)) throw new Error('Expected a sanitized DemoError');
    expect(error.status).toBe(status < 300 ? 502 : status);
    expect(error.message).toContain(`unreadable response (HTTP ${status})`);
    expect(error.message).not.toContain('could not be reached');
    expect(error.message).not.toContain(privateMarker);
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/config', '/api/ai/assistant']);
  });

  it('preserves the server JSON error and diagnostic reference', async () => {
    const message = 'Gemini rejected the request settings. Reference: 00000000-0000-4000-8000-000000000001.';
    const { ask } = await setup(() => Response.json({ error: message }, { status: 502 }));
    await expect(ask()).rejects.toMatchObject({ status: 502, message });
  });

  it.each([null, { error: { detail: privateMarker } }, { error: privateMarker.repeat(30) }])('uses the existing safe fallback for unrecognized JSON error payloads', async payload => {
    const { ask } = await setup(() => Response.json(payload, { status: 429 }));
    await expect(ask()).rejects.toMatchObject({ status: 429, message: 'The AI request could not be completed. Please try again later.' });
  });

  it('returns a valid JSON answer unchanged', async () => {
    const answer = { answer: 'No official verification was performed.', sources: [], mode: 'gemini' };
    const { ask } = await setup(() => Response.json(answer));
    await expect(ask()).resolves.toEqual(answer);
  });

  it('retains the connection message only when fetch fails before receiving a response', async () => {
    const { ask } = await setup(() => Promise.reject(new TypeError(privateMarker)));
    await expect(ask()).rejects.toMatchObject({ status: 503, message: 'The server could not be reached. Check your connection and try again.' });
  });

  it('keeps failed extraction metadata available for manual recovery without retaining response or file content', async () => {
    const { workspace, property, request } = await setup(() => new Response(`<html>${privateMarker}</html>`, { status: 502 }));
    const fileText = 'FICTIONAL ORIGINAL BYTES NOT TO RETAIN';
    const form = new FormData();
    form.set('file', new File([fileText], 'fictional.txt', { type: 'text/plain' }));
    form.set('kind', 'jamabandi'); form.set('consent', 'true'); form.set('aiConsent', 'true');
    const result = await workspace.api<{ document: PropertyDocument }>(`/api/cases/${property.id}/documents`, { method: 'POST', body: form });
    expect(result.document).toMatchObject({ name: 'fictional.txt', extraction: 'failed', fields: {}, reviewed: false, originalAvailability: 'not_retained' });
    expect(result.document.error).toContain('unreadable response (HTTP 502)');
    const stored = await workspace.api<{ case: PropertyCase }>(`/api/cases/${property.id}`);
    expect(stored.case.documents).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(privateMarker);
    expect(JSON.stringify(stored)).not.toContain(fileText);
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/config', '/api/ai/extract']);
  });

  it('gives caller cancellation priority over an interrupted response body', async () => {
    let bodyStarted = false;
    const { ask } = await setup(options => {
      const response = new Response('', { status: 502 });
      vi.spyOn(response, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        bodyStarted = true;
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }));
      return response;
    });
    const controller = new AbortController();
    const pending = ask(controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError', message: 'Request cancelled.' });
    await vi.waitFor(() => expect(bodyStarted).toBe(true));
    controller.abort();
    await assertion;
  });

  it('gives the deadline priority over an interrupted response body', async () => {
    vi.useFakeTimers();
    const { ask } = await setup(options => {
      const response = new Response('', { status: 502 });
      vi.spyOn(response, 'json').mockImplementation(() => new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }));
      return response;
    });
    const pending = ask();
    const assertion = expect(pending).rejects.toMatchObject({ status: 504, message: 'The AI request timed out. Please try again later.' });
    await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
    await assertion;
  });
});
