/** Discard and cancel in-flight work after the saved workspace is reset. */
export class ClientSessionRequests {
  private generation = {};
  private pending = new Set<AbortController>();

  get identity() { return this.generation; }

  invalidate() {
    this.generation = {};
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
  }

  async run<T>(action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const identity = this.generation;
    const controller = new AbortController();
    this.pending.add(controller);
    try {
      const result = await action(controller.signal);
      // A mock, cache, or already-completed request may ignore cancellation.
      if (identity !== this.generation) throw new DOMException('Workspace reset.', 'AbortError');
      return result;
    } finally {
      this.pending.delete(controller);
    }
  }
}
