import { z } from 'zod';
import { analyzeCase } from './checks';
import { demoDocumentText, demoTemplates } from './demo';
import { createCaseSchema, documentKindSchema, fieldsSchema, patchCaseSchema, questionSchema } from './demo-validation';
import { BACKUP_BYTES, parseBackup, publicCaseSnapshot, serializeBackup } from './browser-backup';
import { createIndexedDbStore, type BrowserWorkspaceStore, type WorkspaceState } from './browser-store';
import type { AssistantAnswer, PropertyCase, PropertyDocument, RuntimeConfig } from './types';

export const DEMO_LIMITS = Object.freeze({ cases: 12, documentsPerCase: 20, documentsTotal: 100, concurrentUploads: 3, fileBytes: 10 * 1024 * 1024 });
export const AI_REQUEST_TIMEOUT_MS = 100_000;
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const extractionSchema = z.object({ fields: fieldsSchema, notes: z.array(z.string().max(600)).max(8) }).strict();
export class DemoError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'DemoError'; }
}
function identifier() { return crypto.randomUUID(); }
function body(options: RequestInit): unknown {
  if (typeof options.body !== 'string' || options.body.length > 128 * 1024) throw new DemoError('Supply a valid, reasonably sized form.');
  try { return JSON.parse(options.body); } catch { throw new DemoError('The form could not be read. Please try again.'); }
}
function detectMime(bytes: Uint8Array, claimed: string): string {
  if (!bytes.length) throw new DemoError('The selected file is empty.');
  if (bytes.length > DEMO_LIMITS.fileBytes) throw new DemoError('Maximum document size is 10 MB.', 413);
  if ([37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte) && ['application/pdf', 'application/octet-stream', ''].includes(claimed)) return 'application/pdf';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) && ['image/png', 'application/octet-stream', ''].includes(claimed)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && ['image/jpeg', 'image/jpg', 'application/octet-stream', ''].includes(claimed)) return 'image/jpeg';
  if (claimed === 'text/plain') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /^\s*(?:<!doctype html|<html|<script|<svg)/i.test(text)) throw new Error();
      return 'text/plain';
    } catch { throw new DemoError('The file is not valid UTF-8 plain text.', 415); }
  }
  throw new DemoError('Choose a valid PDF, PNG, JPEG, or UTF-8 text file. The file type must match its contents.', 415);
}
function sanitizeFilename(name: string) { return name.replace(/\\/g, '/').split('/').pop()!.replace(/[\r\n\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 180) || 'document'; }
export type BrowserDownload = { content: string; mimeType: string; filename: string };
export type WorkspaceDependencies = { store?: BrowserWorkspaceStore; request?: typeof fetch };

/** Cases stay in IndexedDB. Only explicitly consented AI requests leave the browser. */
export function createBrowserDemoWorkspace(dependencies: WorkspaceDependencies = {}) {
  const durableStore = dependencies.store ?? createIndexedDbStore();
  const store: BrowserWorkspaceStore = {
    read: () => durableStore.read(),
    mutate: operation => durableStore.mutate(state => {
      const result = operation(state);
      // Keep every committed workspace exportable and re-importable within the same cap.
      serializeBackup(state.cases);
      return result;
    }),
  };
  const request = dependencies.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let generation = 0, uploadsInFlight = 0;
  const guard = (epoch: number, signal?: AbortSignal | null) => { if (epoch !== generation || signal?.aborted) throw new DOMException('Work cancelled. The workspace or case changed.', 'AbortError'); };
  const getCase = (state: WorkspaceState, id: string) => {
    const property = state.cases.find(item => item.id === id);
    if (!property) throw new DemoError('Case not found. It may have been deleted in another tab or browser storage was cleared.', 404);
    return property;
  };
  const count = (state: WorkspaceState) => state.cases.reduce((sum, property) => sum + property.documents.length, 0);
  const checkCapacity = (state: WorkspaceState, property: PropertyCase) => {
    if (property.documents.length >= DEMO_LIMITS.documentsPerCase) throw new DemoError('Each case supports up to 20 documents.');
    if (count(state) >= DEMO_LIMITS.documentsTotal) throw new DemoError('This browser workspace is full. Export a backup and remove unused cases.');
  };
  const update = (state: WorkspaceState, property: PropertyCase, invalidate = true) => {
    property.updatedAt = now(); if (invalidate) property.analysis = null;
    state.revisions[property.id] = (state.revisions[property.id] ?? 0) + 1;
    return property;
  };
  async function remote<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (typeof options.body === 'string') headers.set('Content-Type', 'application/json');
    const timeout = new AbortController();
    const externalAbort = () => timeout.abort();
    options.signal?.addEventListener('abort', externalAbort, { once: true });
    if (options.signal?.aborted) timeout.abort();
    const timer = setTimeout(() => timeout.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
      const response = await request(path, { ...options, headers, signal: timeout.signal, credentials: 'same-origin', cache: 'no-store' });
      let data: unknown;
      try { data = await response.json(); }
      catch {
        // Receiving an unreadable response is not the same as failing to reach
        // the server. Never expose a proxy page, parser excerpt or response body.
        throw new DemoError(`The server returned an unreadable response (HTTP ${response.status}). Please try again later.`, response.ok ? 502 : response.status);
      }
      if (!response.ok) {
        const error = data !== null && typeof data === 'object' && 'error' in data ? data.error : undefined;
        const safe = typeof error === 'string' && error.length <= 500 ? error : 'The AI request could not be completed. Please try again later.';
        throw new DemoError(safe, response.status);
      }
      return data as T;
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
      if (timeout.signal.aborted) throw new DemoError('The AI request timed out. Please try again later.', 504);
      if (error instanceof DemoError) throw error;
      throw new DemoError('The server could not be reached. Check your connection and try again.', 503);
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', externalAbort); }
  }
  function report(property: PropertyCase) {
    if (!property.analysis) throw new DemoError('Run document checks before exporting the report.', 409);
    return {
      schemaVersion: 'bhuverify-browser-ai-report/v1', generatedAt: now(), title: 'BhuVerify prototype document review report',
      mode: 'browser-saved-prototype', aiUsed: property.documents.some(document => document.extraction === 'gemini' || document.notes.some(note => note.startsWith('AI-extracted fields'))), governmentVerification: 'not_performed',
      limitations: [
        'Prototype for fictional documents only. Cases are saved in this browser, not synced across devices. Clearing site data can remove them; keep backups.',
        'No login, Firebase, or server-side case database. Consented documents and current-case questions may be processed by Gemini.',
        'Checks apply deterministic comparison rules to supplied fields. AI extraction can be wrong; review every field and source quote.',
        'No government database was queried. This report does not establish ownership, certify title, authenticate documents, or rule out fraud.',
        'Original files are not retained. Keep your own copies. Mutation is not a title guarantee.',
        ...(property.demo ? ['SYNTHETIC DEMO: All sample people, plots and documents are fictional.'] : []),
      ], case: { ...publicCaseSnapshot(property), analysis: property.analysis },
    };
  }

  async function dispatch(path: string, options: RequestInit = {}): Promise<unknown> {
    const epoch = generation;
    guard(epoch, options.signal);
    const method = (options.method ?? 'GET').toUpperCase();
    if (path === '/api/config' && method === 'GET') return remote<RuntimeConfig>(path, options);
    if (path === '/api/cases') {
      if (method === 'GET') return { cases: (await store.read()).cases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
      if (method === 'POST') {
        const input = createCaseSchema.parse(body(options));
        return store.mutate(state => {
          guard(epoch, options.signal);
          if (state.cases.length >= DEMO_LIMITS.cases) throw new DemoError('The prototype supports 12 saved cases. Export a backup and remove one first.');
          const identity = { id: identifier(), ownerId: 'browser-local', createdAt: now(), updatedAt: now() };
          let property: PropertyCase;
          if ('demoId' in input) {
            const template = demoTemplates.find(item => item.id === input.demoId);
            if (!template) throw new DemoError('Sample case not found.', 404);
            if (count(state) + template.case.documents.length > DEMO_LIMITS.documentsTotal) throw new DemoError('This browser workspace is full.');
            property = { ...clone(template.case), ...identity, analysis: null };
            property.documents.forEach(document => { document.originalAvailability = 'sample'; });
          } else property = { ...input, ...identity, demo: false, documents: [], analysis: null };
          state.cases.push(property); state.revisions[property.id] = 1;
          return { case: property };
        });
      }
      throw new DemoError('This action is not available.', 405);
    }
    const match = /^\/api\/cases\/([a-zA-Z0-9-]+)(?:\/(analyze|assistant|report|documents)(?:\/([a-zA-Z0-9-]+))?)?$/.exec(path);
    if (!match) throw new DemoError('This action is not available.', 404);
    const [, id, resource, documentId] = match;
    const snapshot = await store.read();
    guard(epoch, options.signal);
    const property = getCase(snapshot, id);
    const mutate = <T>(operation: (state: WorkspaceState, latest: PropertyCase) => T) => store.mutate(state => {
      guard(epoch, options.signal);
      if (state.epoch !== snapshot.epoch) throw new DOMException('Workspace was reset.', 'AbortError');
      return operation(state, getCase(state, id));
    });
    if (!resource) {
      if (method === 'GET') return { case: property };
      if (method === 'DELETE') return mutate(state => { state.cases = state.cases.filter(item => item.id !== id); delete state.revisions[id]; return { deleted: true }; });
      if (method === 'PATCH') {
        const input = patchCaseSchema.parse(body(options));
        return mutate((state, latest) => {
          if ('documentId' in input) {
            const document = latest.documents.find(item => item.id === input.documentId);
            if (!document) throw new DemoError('Document not found.', 404);
            document.fields = input.fields; document.reviewed = true; document.extraction = 'manual'; delete document.error;
            const note = 'Fields were manually reviewed or entered by the user. No official verification was performed.';
            document.notes = [...document.notes.filter(item => item !== note).slice(0, 9), note];
          } else Object.assign(latest, input);
          return { case: update(state, latest) };
        });
      }
    }
    if (resource === 'analyze' && !documentId && method === 'POST') return mutate((state, latest) => { latest.analysis = analyzeCase(latest); return { case: update(state, latest, false) }; });
    if (resource === 'assistant' && !documentId && method === 'POST') {
      const input = questionSchema.parse(body(options));
      const config = await remote<RuntimeConfig>('/api/config', { signal: options.signal });
      guard(epoch, options.signal);
      if (!config.aiEnabled) {
        throw new DemoError('Gemini is not enabled. Configure the server-side API key to ask questions. Deterministic document checks and manual review remain available.', 503);
      }
      if (input.consent !== true) throw new DemoError('Confirm that you agree to send this current case and your question to Gemini.');
      const answer = await remote<AssistantAnswer>('/api/ai/assistant', { method: 'POST', body: JSON.stringify({ case: publicCaseSnapshot(property), question: input.question, consent: true }), signal: options.signal });
      guard(epoch, options.signal);
      const latest = await store.read();
      if (latest.epoch !== snapshot.epoch || latest.revisions[id] !== snapshot.revisions[id]) throw new DOMException('Case changed while the answer was generated. Ask again using the updated case.', 'AbortError');
      return answer;
    }
    if (resource === 'report' && !documentId && method === 'GET') return report(property);
    if (resource === 'documents' && !documentId && method === 'POST') {
      if (property.demo) throw new DemoError('Create a new fictional case to try adding documents. Sample cases contain preset evidence only.');
      checkCapacity(snapshot, property);
      if (!(options.body instanceof FormData)) throw new DemoError('Choose a fictional document to add.');
      const form = options.body;
      if (form.get('consent') !== 'true') throw new DemoError('Confirm this is fictional and consent to document processing.');
      const files = form.getAll('file'), file = files[0];
      if (files.length !== 1 || !file || typeof file === 'string') throw new DemoError('Choose one document at a time.');
      const kind = documentKindSchema.parse(form.get('kind'));
      if (file.size > DEMO_LIMITS.fileBytes) throw new DemoError('Maximum document size is 10 MB.', 413);
      if (uploadsInFlight >= DEMO_LIMITS.concurrentUploads) throw new DemoError('Please wait for the other selected documents to finish.');
      uploadsInFlight++;
      try {
        const buffer = await file.arrayBuffer(); guard(epoch, options.signal);
        const bytes = new Uint8Array(buffer), mimeType = detectMime(bytes, file.type);
        if (!globalThis.crypto?.subtle) throw new DemoError('Open this prototype on HTTPS or localhost to process documents securely.');
        const digest = await crypto.subtle.digest('SHA-256', buffer); guard(epoch, options.signal);
        const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const config = await remote<RuntimeConfig>('/api/config', { signal: options.signal }); guard(epoch, options.signal);
        // Consent reflects the disclosure the person accepted, not a later server configuration.
        const useAi = config.aiEnabled && form.get('aiConsent') === 'true';
        const document: PropertyDocument = {
          id: identifier(), name: sanitizeFilename(file.name), kind, mimeType, size: bytes.length, sha256, createdAt: now(),
          extraction: useAi ? 'pending' : 'manual', fields: {}, reviewed: false, originalAvailability: 'not_retained',
          notes: [useAi ? 'Awaiting consented Gemini extraction. Original file bytes are not saved in this browser.' : 'AI processing was not selected or is unavailable. Open Review fields and enter facts and source quotes manually. Original file bytes are not retained.'],
        };
        const saved = await mutate((state, latest) => {
          checkCapacity(state, latest);
          if (latest.documents.some(item => item.sha256 === sha256)) throw new DemoError('This exact file is already attached to the case.', 409);
          latest.documents.push(document);
          return { case: update(state, latest), document };
        });
        if (!useAi) return saved;
        let result: z.infer<typeof extractionSchema> | undefined;
        let failure: string | undefined;
        try {
          const upload = new FormData(); upload.set('file', file); upload.set('kind', kind); upload.set('consent', 'true');
          result = extractionSchema.parse(await remote('/api/ai/extract', { method: 'POST', body: upload, signal: options.signal }));
        } catch (error) {
          if (options.signal?.aborted || epoch !== generation) throw new DOMException('Upload cancelled.', 'AbortError');
          failure = error instanceof DemoError ? error.message : 'AI extraction could not be completed. Review fields manually or try another document.';
        }
        guard(epoch, options.signal);
        return mutate((state, latest) => {
          const target = latest.documents.find(item => item.id === document.id);
          if (!target || JSON.stringify(target) !== JSON.stringify(document)) throw new DOMException('Document was changed or removed while extraction was running.', 'AbortError');
          if (result) {
            target.fields = result.fields; target.notes = [...result.notes, 'AI-extracted fields are unverified. Compare every value and quote with your original document.'];
            target.extraction = 'gemini';
          } else { target.extraction = 'failed'; target.error = failure; target.notes = ['AI extraction failed. Open Review fields to enter facts manually. No original bytes were retained.']; }
          return { case: update(state, latest), document: target };
        });
      } finally { uploadsInFlight--; }
    }
    if (resource === 'documents' && documentId && method === 'DELETE') return mutate((state, latest) => {
      if (!latest.documents.some(item => item.id === documentId)) throw new DemoError('Document not found.', 404);
      latest.documents = latest.documents.filter(item => item.id !== documentId);
      return { case: update(state, latest), deleted: true };
    });
    throw new DemoError('This action is not available.', 405);
  }
  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    try { return await dispatch(path, options) as T; }
    catch (error) { if (error instanceof z.ZodError) throw new DemoError('Check the form fields. Values must be valid, within the length limits, and contain no unsupported fields.'); throw error; }
  }
  async function download(path: string, signal?: AbortSignal): Promise<BrowserDownload> {
    const epoch = generation; guard(epoch, signal);
    const match = /^\/api\/cases\/([a-zA-Z0-9-]+)\/(report|documents)(?:\/([a-zA-Z0-9-]+))?$/.exec(path);
    if (!match) throw new DemoError('This download is not available.', 404);
    const [, id, resource, documentId] = match;
    const property = getCase(await store.read(), id); guard(epoch, signal);
    if (resource === 'report' && !documentId) return { content: JSON.stringify(report(property), null, 2), mimeType: 'application/json', filename: `bhuverify-${id}.json` };
    const document = property.documents.find(item => item.id === documentId);
    if (resource !== 'documents' || !document) throw new DemoError('Document not found.', 404);
    if (document.originalAvailability !== 'sample') throw new DemoError('Original files are not retained. Use your own document copy.', 410);
    const source = demoTemplates.flatMap(template => template.case.documents).find(item => item.id === documentId);
    if (!source) throw new DemoError('Synthetic source document is unavailable.', 404);
    return { content: demoDocumentText(source), mimeType: 'text/plain;charset=utf-8', filename: `${source.name.replace(/\.[^.]+$/, '')}-SYNTHETIC.txt` };
  }
  return {
    api, download,
    async reset() { generation++; await store.mutate(state => { state.epoch++; state.cases = []; state.revisions = {}; }); },
    async exportBackup(): Promise<BrowserDownload> { return { content: serializeBackup((await store.read()).cases), mimeType: 'application/json', filename: `bhuverify-backup-${now().slice(0, 10)}.json` }; },
    async importBackup(file: File): Promise<{ count: number }> {
      const epoch = generation;
      const original = await store.read();
      if (file.size > BACKUP_BYTES) throw new DemoError('Backup files must be no larger than 8 MB.', 413);
      let imported: PropertyCase[];
      try { imported = parseBackup(await file.text(), identifier); }
      catch { throw new DemoError('This is not a valid BhuVerify workspace backup. Nothing was imported. Use an exported backup JSON file, no larger than 8 MB.'); }
      guard(epoch);
      return store.mutate(state => {
        guard(epoch); if (state.epoch !== original.epoch) throw new DOMException('Workspace was reset.', 'AbortError');
        if (state.cases.length + imported.length > DEMO_LIMITS.cases || count(state) + imported.reduce((sum, property) => sum + property.documents.length, 0) > DEMO_LIMITS.documentsTotal) throw new DemoError('Not enough browser workspace capacity. Nothing was imported. Export a backup and remove unused cases first.');
        for (const property of imported) { property.analysis = analyzeCase(property); state.cases.push(property); state.revisions[property.id] = 1; }
        return { count: imported.length };
      });
    },
  };
}
