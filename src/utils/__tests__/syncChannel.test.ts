import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWishSyncChannel, SyncMessage } from '../syncChannel';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('syncChannel', () => {
  it('returns safe no-op stubs when BroadcastChannel is unavailable', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const ch = createWishSyncChannel(() => {});
    expect(() => ch.post({ type: 'REQUEST_STATE' })).not.toThrow();
    expect(() => ch.close()).not.toThrow();
  });

  it('forwards valid messages, closes cleanly, and warns when postMessage fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const postSpy = vi.fn();
    const closeSpy = vi.fn();

    const instances: MockBroadcastChannel[] = [];
    class MockBroadcastChannel {
      onmessage: ((event: MessageEvent<SyncMessage>) => void) | null = null;
      postMessage = postSpy;
      close = closeSpy;
      constructor() {
        instances.push(this);
      }
    }

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);

    const received: SyncMessage[] = [];
    const ch = createWishSyncChannel((msg) => received.push(msg));

    const instance = instances[0];
    expect(instance).toBeDefined();
    instance?.onmessage?.({ data: { type: 'CMD_SKIP_RACE' } } as MessageEvent<SyncMessage>);
    expect(received).toEqual([{ type: 'CMD_SKIP_RACE' }]);

    ch.post({ type: 'REQUEST_STATE' });
    expect(postSpy).toHaveBeenCalledWith({ type: 'REQUEST_STATE' });

    postSpy.mockImplementationOnce(() => {
      throw new Error('Channel closed');
    });
    ch.post({ type: 'CMD_ADVANCE_REVEAL' });
    expect(warnSpy).toHaveBeenCalledOnce();

    ch.close();
    expect(closeSpy).toHaveBeenCalledOnce();
  });
});
