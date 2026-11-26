/**
 * Cryptographically uniform float in [0, 1)
 */
export function secureRandom(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / (0xffffffff + 1);
}

export function createId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.floor(secureRandom() * 1e9).toString(36)}`;
}
