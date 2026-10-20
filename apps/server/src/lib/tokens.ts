import { createHash, randomBytes } from 'node:crypto';

/** A random token for links (invites, setup, password reset): 256 bits, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * How a token is stored: only its SHA-256 hash, so a database leak does not leak usable links.
 * A fast hash is enough for 256-bit random tokens (no brute force possible).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
