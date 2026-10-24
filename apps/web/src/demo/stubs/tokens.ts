// Stands in for apps/server/src/lib/tokens.ts in the demo build (node:crypto is not in a browser).
// Demo data never leaves the visitor's browser: the stored "hash" only has to find a link again.

/** A random token for links: 256 bits, URL-safe (as on the server). */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** A stable fingerprint of a token (FNV-1a, four seeds): demo only, not a security measure. */
export function hashToken(token: string): string {
  return [0x811c9dc5, 0x01000193, 0x2545f491, 0x9e3779b9]
    .map((seed) => {
      let value = seed;
      for (let i = 0; i < token.length; i++) {
        value ^= token.charCodeAt(i);
        value = Math.imul(value, 16777619);
      }
      return (value >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
}
