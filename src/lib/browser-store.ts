import type { PropertyCase } from './types';

export type WorkspaceState = { epoch: number; cases: PropertyCase[]; revisions: Record<string, number> };
export interface BrowserWorkspaceStore {
  read(): Promise<WorkspaceState>;
  mutate<T>(operation: (state: WorkspaceState) => T): Promise<T>;
}
const emptyState = (): WorkspaceState => ({ epoch: 0, cases: [], revisions: {} });
const copy = <T>(value: T): T => structuredClone(value);

function storageError(error: unknown): Error {
  const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'QuotaExceededError') return new Error('Browser storage is full. Export a backup, then remove unused cases or free browser storage. Your change was not saved.');
  return new Error('Browser storage is unavailable or blocked. Allow site storage in a normal browser window and reload. Your change was not saved.');
}

/** A single read/write transaction serializes updates across tabs. No silent memory fallback. */
export function createIndexedDbStore(databaseName = 'bhuverify-ai-prototype-v1'): BrowserWorkspaceStore {
  let connection: Promise<IDBDatabase> | undefined;
  function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(storageError(null));
    return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => fail(), 8000);
      const fail = () => { if (!settled) { settled = true; clearTimeout(timer); connection = undefined; reject(storageError(null)); } };
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open(databaseName, 1); } catch { fail(); return; }
      request.onupgradeneeded = () => { request.result.createObjectStore('workspace'); };
      request.onerror = fail;
      request.onblocked = fail;
      request.onsuccess = () => {
        if (settled) { request.result.close(); return; }
        settled = true; clearTimeout(timer);
        const db = request.result;
        db.onversionchange = () => { db.close(); connection = undefined; };
        resolve(db);
      };
    });
  }
  async function transaction<T>(mode: IDBTransactionMode, operation: (state: WorkspaceState) => T): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction('workspace', mode); } catch (error) { connection = undefined; reject(storageError(error)); return; }
      const store = tx.objectStore('workspace');
      const request = store.get('current');
      let result: T, explicitError: unknown;
      tx.oncomplete = () => resolve(copy(result));
      tx.onabort = () => reject(explicitError ?? storageError(tx.error));
      tx.onerror = () => { /* The abort handler reports the durable write failure. */ };
      request.onsuccess = () => {
        try {
          const state: WorkspaceState = request.result ?? emptyState();
          result = operation(state);
          if (mode === 'readwrite') store.put(state, 'current');
        } catch (error) { explicitError = error; tx.abort(); }
      };
    });
  }
  return { read: () => transaction('readonly', state => state), mutate: operation => transaction('readwrite', operation) };
}

/** Explicit test-only injection; the browser production facade always uses IndexedDB. */
export function createMemoryWorkspaceStore(): BrowserWorkspaceStore {
  let state = emptyState();
  return {
    async read() { return copy(state); },
    async mutate<T>(operation: (draft: WorkspaceState) => T) {
      const draft = copy(state);
      const result = operation(draft);
      state = draft;
      return copy(result);
    },
  };
}
