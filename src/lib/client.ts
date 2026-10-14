import { createBrowserDemoWorkspace } from './browser-demo';

// Lazily created only in the browser: no case data exists during server rendering.
let workspace: ReturnType<typeof createBrowserDemoWorkspace> | undefined;
function currentWorkspace() {
  if (typeof window === 'undefined') throw new Error('The browser-saved workspace is available only in your browser.');
  return workspace ??= createBrowserDemoWorkspace();
}

/** Case CRUD stays local; configuration and explicitly consented Gemini requests use the server. */
export function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  return currentWorkspace().api<T>(path, options);
}

export async function resetDemoWorkspace(): Promise<void> { await currentWorkspace().reset(); }

export async function exportWorkspaceBackup(): Promise<void> {
  saveDownload(await currentWorkspace().exportBackup());
}

export function importWorkspaceBackup(file: File): Promise<{ count: number }> {
  return currentWorkspace().importBackup(file);
}

export async function download(path: string, filename: string, signal?: AbortSignal) {
  const file = await currentWorkspace().download(path, signal);
  if (signal?.aborted) throw new DOMException('Download cancelled.', 'AbortError');
  saveDownload({ ...file, filename: filename || file.filename });
}

function saveDownload(file: { content: string; mimeType: string; filename: string }) {
  const url = URL.createObjectURL(new Blob([file.content], { type: file.mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Let the browser begin the save before releasing this temporary object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
