import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { env } from '../env';

/**
 * The client IP, for rate limiting. Behind a reverse proxy (TRUST_PROXY=true) it is the last
 * address of X-Forwarded-For, the one added by our proxy: earlier entries are client-supplied.
 * Without a proxy the header is ignored (anyone could forge it) and the socket address is used.
 */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY) {
    const forwarded = c.req.header('x-forwarded-for')?.split(',').pop()?.trim();
    if (forwarded) return forwarded;
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
