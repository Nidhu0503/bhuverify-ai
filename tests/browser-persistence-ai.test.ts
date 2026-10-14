import { describe, expect, it, vi } from 'vitest';
import { AI_REQUEST_TIMEOUT_MS, createBrowserDemoWorkspace } from '../src/lib/browser-demo';
import { BACKUP_BYTES, serializeBackup } from '../src/lib/browser-backup';
import { createIndexedDbStore, createMemoryWorkspaceStore, type BrowserWorkspaceStore } from '../src/lib/browser-store';
import { FIELD_LABELS, type AssistantAnswer, type ExtractedFields, type PropertyCase, type PropertyDocument } from '../src/lib/types';

const json = (value: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(value) });
const config = (enabled = true) => ({ persistence: 'browser', originalRetention: 'none', aiEnabled: enabled, model: enabled ? 'gemini-test' : 'none', authRequired: false, firebase: null });
const evidence = { owner: { value: 'Asha Demo', page: 1, quote: 'Recorded owner: Asha Demo', confidence: 'high' } };
type Workspace = ReturnType<typeof createBrowserDemoWorkspace>;
const create = async (workspace: Workspace, title = 'Fictional case') => (await workspace.api<{ case: PropertyCase }>('/api/cases', json({ title, state: 'BR' }))).case;
const list = async (workspace: Workspace) => (await workspace.api<{ cases: PropertyCase[] }>('/api/cases')).cases;
const get = async (workspace: Workspace, id: string) => (await workspace.api<{ case: PropertyCase }>(`/api/cases/${id}`)).case;
function form(text = 'FICTIONAL ONLY — Recorded owner: Asha Demo') {
  const data = new FormData(); data.set('file', new File([text], 'fictional.txt', { type: 'text/plain' })); data.set('kind', 'jamabandi'); data.set('consent', 'true'); data.set('aiConsent', 'true'); return data;
}
const upload = (workspace: Workspace, id: string, data = form()) => workspace.api<{ case: PropertyCase; document: PropertyDocument }>(`/api/cases/${id}/documents`, { method: 'POST', body: data });
const answer: AssistantAnswer = { answer: 'The fictional current case needs review.', sources: [], mode: 'gemini' };
function setup(enabled = true, store: BrowserWorkspaceStore = createMemoryWorkspaceStore()) {
  const request = vi.fn(async (path: RequestInfo | URL) => {
    if (path === '/api/config') return Response.json(config(enabled));
    if (path === '/api/ai/extract') return Response.json({ fields: evidence, notes: ['Fictional source only.'] });
    if (path === '/api/ai/assistant') return Response.json(answer);
    throw new Error(`Unexpected request ${path}`);
  });
  return { workspace: createBrowserDemoWorkspace({ store, request }), store, request };
}

describe('durable browser workspace and Gemini boundary', () => {
  it('reopens saved cases through a new workspace and keeps separate browser stores isolated', async () => {
    const { workspace, store } = setup(false);
    const property = await create(workspace);
    const reopened = setup(false, store).workspace;
    expect((await list(reopened)).map(item => item.id)).toEqual([property.id]);
    expect(await list(setup(false).workspace)).toEqual([]);
  });
  it('preserves concurrent cross-tab metadata updates using transactions', async () => {
    const { workspace, store } = setup(false), second = setup(false, store).workspace;
    const property = await create(workspace);
    await Promise.all([
      workspace.api(`/api/cases/${property.id}`, json({ title: 'Updated title' }, 'PATCH')),
      second.api(`/api/cases/${property.id}`, json({ seller: 'Another fictional seller' }, 'PATCH')),
    ]);
    expect(await get(workspace, property.id)).toMatchObject({ title: 'Updated title', seller: 'Another fictional seller' });
  });
  it('extracts only consented selected document and saves unreviewed fields but no original bytes', async () => {
    const { workspace, request } = setup();
    const property = await create(workspace);
    const result = await upload(workspace, property.id);
    expect(result.document).toMatchObject({ extraction: 'gemini', reviewed: false, fields: evidence, originalAvailability: 'not_retained' });
    const calls = request.mock.calls as unknown as [string, RequestInit][];
    const sent = calls.find(([path]) => path === '/api/ai/extract')![1].body as FormData;
    expect([...sent.keys()].sort()).toEqual(['consent', 'file', 'kind']);
    expect(sent.get('consent')).toBe('true');
    const stored = await get(workspace, property.id);
    expect(JSON.stringify(stored)).not.toContain('FICTIONAL ONLY —');
    expect(stored.documents[0]).not.toHaveProperty('storageKey');
  });
  it('does not send a document without explicit consent', async () => {
    const { workspace, request } = setup();
    const property = await create(workspace); const data = form(); data.delete('consent');
    await expect(upload(workspace, property.id, data)).rejects.toThrow('Confirm');
    expect(request).not.toHaveBeenCalled();
  });
  it('does not escalate manual-only consent if server AI becomes enabled after the disclosure', async () => {
    const { workspace, request } = setup(true);
    const property = await create(workspace), data = form(); data.set('aiConsent', 'false');
    const result = await upload(workspace, property.id, data);
    expect(result.document).toMatchObject({ extraction: 'manual', fields: {}, reviewed: false });
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/config']);
  });
  it('keeps manual workflow when AI becomes disabled despite earlier AI consent', async () => {
    const { workspace, request } = setup(false);
    const property = await create(workspace);
    const result = await upload(workspace, property.id, form());
    expect(result.document).toMatchObject({ extraction: 'manual', fields: {}, reviewed: false });
    expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/config']);
  });
  it('only sends current-case evidence and requires question consent when AI enabled', async () => {
    const { workspace, request } = setup();
    const current = await create(workspace, 'Current public fictional case');
    await create(workspace, 'OTHER CASE MUST STAY LOCAL');
    await expect(workspace.api(`/api/cases/${current.id}/assistant`, json({ question: 'What is recorded here?' }))).rejects.toThrow('Confirm');
    expect(await workspace.api(`/api/cases/${current.id}/assistant`, json({ question: 'What is recorded here?', consent: true }))).toEqual(answer);
    const calls = request.mock.calls as unknown as [string, RequestInit][];
    const sent = JSON.parse(calls.find(([path]) => path === '/api/ai/assistant')![1].body as string);
    expect(sent).toMatchObject({ consent: true, question: 'What is recorded here?', case: { id: current.id } });
    expect(sent.case).not.toHaveProperty('ownerId'); expect(sent.case).not.toHaveProperty('analysis');
    expect(JSON.stringify(sent)).not.toContain('OTHER CASE MUST STAY LOCAL');
  });
  it('stores failed extraction for honest manual recovery, never a fake successful AI answer', async () => {
    const store = createMemoryWorkspaceStore();
    const request = vi.fn(async (path: RequestInfo | URL) => path === '/api/config' ? Response.json(config()) : Response.json({ error: 'AI is temporarily unavailable.' }, { status: 503 }));
    const workspace = createBrowserDemoWorkspace({ store, request }), property = await create(workspace);
    const result = await upload(workspace, property.id);
    expect(result.document).toMatchObject({ extraction: 'failed', fields: {}, reviewed: false, error: 'AI is temporarily unavailable.' });
    expect((await get(workspace, property.id)).documents).toHaveLength(1);
    await expect(workspace.api(`/api/cases/${property.id}/assistant`, json({ question: 'What is recorded here?', consent: true }))).rejects.toThrow('AI is temporarily unavailable.');
  });
  it('does not resurrect a case if another tab resets during extraction', async () => {
    const store = createMemoryWorkspaceStore(); let finish!: (value: Response) => void;
    const request = vi.fn(async (path: RequestInfo | URL) => path === '/api/config' ? Response.json(config()) : new Promise<Response>(resolve => { finish = resolve; }));
    const workspace = createBrowserDemoWorkspace({ store, request }), property = await create(workspace);
    const pending = upload(workspace, property.id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await setup(false, store).workspace.reset();
    finish(Response.json({ fields: evidence, notes: [] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await list(workspace)).toEqual([]);
  });
  it('does not overwrite manually reviewed fields with late extraction', async () => {
    const store = createMemoryWorkspaceStore(); let finish!: (value: Response) => void;
    const request = vi.fn(async (path: RequestInfo | URL) => path === '/api/config' ? Response.json(config()) : new Promise<Response>(resolve => { finish = resolve; }));
    const workspace = createBrowserDemoWorkspace({ store, request }), property = await create(workspace);
    const pending = upload(workspace, property.id);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const document = (await get(workspace, property.id)).documents[0];
    await workspace.api(`/api/cases/${property.id}`, json({ documentId: document.id, fields: {}, reviewed: true }, 'PATCH'));
    finish(Response.json({ fields: evidence, notes: [] }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((await get(workspace, property.id)).documents[0]).toMatchObject({ fields: {}, extraction: 'manual', reviewed: true });
  });
  it('rejects answers generated against a stale case revision', async () => {
    const store = createMemoryWorkspaceStore(); let finish!: (value: Response) => void;
    const request = vi.fn(async (path: RequestInfo | URL) => path === '/api/config' ? Response.json(config()) : new Promise<Response>(resolve => { finish = resolve; }));
    const workspace = createBrowserDemoWorkspace({ store, request }), property = await create(workspace);
    const pending = workspace.api(`/api/cases/${property.id}/assistant`, json({ question: 'What is recorded here?', consent: true }));
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await workspace.api(`/api/cases/${property.id}`, json({ title: 'Edited during answer' }, 'PATCH'));
    finish(Response.json(answer));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('waits for durable commit and surfaces write failures instead of falsely succeeding', async () => {
    const underlying = createMemoryWorkspaceStore();
    const broken: BrowserWorkspaceStore = { read: underlying.read, mutate: async () => { throw new Error('Browser storage is full'); } };
    const { workspace } = setup(false, broken);
    await expect(create(workspace)).rejects.toThrow('Browser storage is full');
    expect(await underlying.read()).toMatchObject({ cases: [] });
  });
  it('reports blocked or unavailable IndexedDB instead of silently falling back', async () => {
    await expect(createIndexedDbStore().read()).rejects.toThrow('Browser storage is unavailable or blocked');
  });
  it('allows a provider response at 90 seconds before the 100-second client deadline', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn(async (path: RequestInfo | URL) => path === '/api/config' ? Response.json(config()) : new Promise<Response>(resolve => setTimeout(() => resolve(Response.json(answer)), 90_000)));
      const workspace = createBrowserDemoWorkspace({ store: createMemoryWorkspaceStore(), request });
      const property = await create(workspace);
      const pending = workspace.api(`/api/cases/${property.id}/assistant`, json({ question: 'What is recorded here?', consent: true }));
      await vi.advanceTimersByTimeAsync(90_000);
      await expect(pending).resolves.toEqual(answer);
      expect(AI_REQUEST_TIMEOUT_MS).toBe(100_000);
    } finally { vi.useRealTimers(); }
  });
  it('times out a stalled request explicitly at the deadline', async () => {
    vi.useFakeTimers();
    try {
      const request = vi.fn((_path: RequestInfo | URL, options?: RequestInit) => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
      const workspace = createBrowserDemoWorkspace({ store: createMemoryWorkspaceStore(), request });
      const pending = workspace.api('/api/config');
      const assertion = expect(pending).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(AI_REQUEST_TIMEOUT_MS);
      await assertion;
    } finally { vi.useRealTimers(); }
  });
});

describe('strict portable browser backups', () => {
  it('round trips all cases using new IDs and recomputed analysis without originals/owner/analysis', async () => {
    const { workspace } = setup(false);
    const sample = (await workspace.api<{ case: PropertyCase }>('/api/cases', json({ demoId: 'plot-mismatch' }))).case;
    const personal = await create(workspace); await upload(workspace, personal.id);
    const exported = await workspace.exportBackup();
    expect(exported.content).not.toContain('ownerId'); expect(exported.content).not.toContain('storageKey'); expect(exported.content).not.toContain('"analysis"');
    expect(JSON.parse(exported.content).cases.flatMap((property: PropertyCase) => property.documents).every((document: PropertyDocument) => document.originalAvailability === 'not_retained')).toBe(true);
    const target = setup(false).workspace;
    expect(await target.importBackup(new File([exported.content], 'backup.json'))).toEqual({ count: 2 });
    const imported = await list(target);
    expect(imported.some(item => item.id === sample.id || item.id === personal.id)).toBe(false);
    expect(imported.every(item => item.analysis?.officialVerification === 'not_performed')).toBe(true);
    expect(imported.flatMap(item => item.documents).every(document => document.originalAvailability === 'not_retained')).toBe(true);
    const reexported = await target.exportBackup();
    expect(new TextEncoder().encode(reexported.content).byteLength).toBe(new TextEncoder().encode(exported.content).byteLength);
  });
  it('atomically rejects unsupported fields, malicious structures and unsupported versions', async () => {
    const { workspace } = setup(false); await create(workspace);
    const backup = JSON.parse((await workspace.exportBackup()).content);
    for (const invalid of [
      { ...backup, schemaVersion: 'future/v5' },
      { ...backup, hidden: 'ignored payload' },
      { ...backup, cases: [{ ...backup.cases[0], ownerId: 'intruder' }] },
      { ...backup, cases: [{ ...backup.cases[0], analysis: { verified: true } }] },
      JSON.parse('{"__proto__":{"polluted":true}}'),
    ]) {
      await expect(workspace.importBackup(new File([JSON.stringify(invalid)], 'bad.json'))).rejects.toThrow('not a valid');
      expect(await list(workspace)).toHaveLength(1);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('rejects oversized backups and overflow imports without losing current cases', async () => {
    const { workspace } = setup(false); await create(workspace);
    const backup = (await workspace.exportBackup()).content;
    for (let index = 1; index < 12; index++) await create(workspace);
    await expect(workspace.importBackup(new File([backup], 'backup.json'))).rejects.toThrow('Nothing was imported');
    await expect(workspace.importBackup(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.json'))).rejects.toMatchObject({ status: 413 });
    expect(await list(workspace)).toHaveLength(12);
  });
  it('keeps high-byte Unicode workspaces exportable and atomically rejects writes beyond the backup cap', async () => {
    const initial = setup(false), base = await create(initial.workspace);
    const largeFields = Object.fromEntries(Object.keys(FIELD_LABELS).map(field => [field, { value: 'प'.repeat(1000), page: 1, quote: 'प'.repeat(2000), confidence: 'low' }])) as ExtractedFields;
    const caseIds = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    const allDocuments: PropertyDocument[] = Array.from({ length: 60 }, (_, index) => ({
      id: crypto.randomUUID(), name: `Fictional ${index}.txt`, kind: 'other', mimeType: 'text/plain',
      size: 1, sha256: `${index}`.padStart(64, '0'), createdAt: base.createdAt, extraction: 'manual',
      fields: structuredClone(largeFields), notes: [], reviewed: true, originalAvailability: 'not_retained',
    }));
    const candidates = (count: number) => caseIds.map((id, index) => ({ ...structuredClone(base), id, documents: structuredClone(allDocuments.slice(index * 20, Math.min(count, (index + 1) * 20))) }));
    let low = 0, high = 60;
    while (low < high) { const middle = Math.ceil((low + high) / 2); try { serializeBackup(candidates(middle)); low = middle; } catch { high = middle - 1; } }
    expect(low).toBeGreaterThan(20); expect(low).toBeLessThan(60);
    const cases = candidates(low + 1), targetCase = cases[Math.floor(low / 20)], target = targetCase.documents[low % 20];
    target.fields = {};
    const store = createMemoryWorkspaceStore();
    await store.mutate(state => { state.cases = cases; state.revisions = Object.fromEntries(cases.map(property => [property.id, 1])); });
    const workspace = setup(false, store).workspace;
    await expect(workspace.api(`/api/cases/${targetCase.id}`, json({ documentId: target.id, fields: largeFields, reviewed: true }, 'PATCH'))).rejects.toThrow('8 MB backup-safe storage limit');
    expect((await get(workspace, targetCase.id)).documents.find(document => document.id === target.id)?.fields).toEqual({});
    const exported = await workspace.exportBackup();
    expect(new TextEncoder().encode(exported.content).byteLength).toBeLessThanOrEqual(BACKUP_BYTES);
    const restored = setup(false).workspace;
    await expect(restored.importBackup(new File([exported.content], 'unicode-backup.json'))).resolves.toEqual({ count: 3 });
    expect(new TextEncoder().encode((await restored.exportBackup()).content).byteLength).toBeLessThanOrEqual(BACKUP_BYTES);
  }, 15000);
});
