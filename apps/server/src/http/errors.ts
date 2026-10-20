import type { ErrorHandler } from 'hono';

/**
 * Last-resort handler: a generic 500, and a log line without the error message, which can carry
 * personal data (a failed SQL query includes its parameters: emails, password hashes…).
 */
export const onError: ErrorHandler = (error, c) => {
  const cause = (error as { cause?: { code?: unknown; constraint_name?: unknown } }).cause;
  const details = [error.name, cause?.code, cause?.constraint_name].filter(Boolean).join(' ');
  console.error(`Unhandled error on ${c.req.method} ${c.req.path}: ${details}`);
  return c.json({ error: 'internal' }, 500);
};
