import { describe, expect, it } from 'vitest';
import { ClientSessionRequests } from '../src/lib/client-session';

describe('client account-bound requests', () => {
  it('aborts requests on account switch and rejects stale responses even if cancellation is ignored', async () => {
    const sessions = new ClientSessionRequests();
    let release!: (value: string) => void;
    let signal!: AbortSignal;
    const firstIdentity = sessions.identity;
    const request = sessions.run(currentSignal => {
      signal = currentSignal;
      return new Promise<string>(resolve => { release = resolve; });
    });
    sessions.invalidate();
    expect(signal.aborted).toBe(true);
    expect(sessions.identity).not.toBe(firstIdentity);
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' });
    release('old account private evidence');
    await rejected;
    await expect(sessions.run(async () => 'new account evidence')).resolves.toBe('new account evidence');
  });

  it('keeps new-account work active when an old-account request completes or fails', async () => {
    const sessions = new ClientSessionRequests();
    let rejectOld!: (error: Error) => void;
    const old = sessions.run(() => new Promise((_, reject) => { rejectOld = reject; }));
    sessions.invalidate();
    let releaseNew!: () => void;
    let newSignal!: AbortSignal;
    const current = sessions.run(signal => {
      newSignal = signal;
      return new Promise<void>(resolve => { releaseNew = resolve; });
    });
    const failed = expect(old).rejects.toThrow('old failure');
    rejectOld(new Error('old failure'));
    await failed;
    expect(newSignal.aborted).toBe(false);
    releaseNew();
    await current;
  });
});
