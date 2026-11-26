import { describe, expect, it } from 'vitest';
import { createId, secureRandom } from '../rng';

describe('rng', () => {
  it('secureRandom returns values in [0, 1)', () => {
    for (let i = 0; i < 25; i++) {
      const val = secureRandom();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('createId returns distinct non-empty IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => createId()));
    expect(ids.size).toBe(20);
  });
});
