import type { SessionUser } from '../modules/auth/auth';

/** Hono context variables set by the middlewares. */
export type AppEnv = {
  Variables: {
    /** Signed-in, enabled user; null for anonymous requests. Set by the session middleware. */
    user: SessionUser | null;
  };
};
