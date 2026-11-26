import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFromStorage, saveToStorage } from '../storage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('storage utilities', () => {
  it('returns fallback and logs warning on malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => '{bad json'),
      setItem: vi.fn(),
    });

    const fallback = [{ id: 'default' }];
    expect(loadFromStorage('broken_key', fallback)).toBe(fallback);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('saves JSON and detects QuotaExceededError in saveToStorage', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem,
    });

    expect(saveToStorage('ok_key', { count: 42 })).toEqual({ ok: true, quotaExceeded: false });
    expect(setItem).toHaveBeenCalledWith('ok_key', '{"count":42}');

    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }),
    });

    expect(saveToStorage('big_key', { data: 'x' })).toEqual({
      ok: false,
      quotaExceeded: true,
    });
  });
});
