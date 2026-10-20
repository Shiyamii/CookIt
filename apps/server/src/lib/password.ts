import { hash, verify } from '@node-rs/argon2';

// argon2id with the library defaults (19 MiB, 2 iterations, parallelism 1: OWASP minimum).
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  try {
    return await verify(input.hash, input.password);
  } catch {
    // Malformed stored hash: never a match.
    return false;
  }
}
