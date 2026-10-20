import type { RateLimitRepository } from './rate-limit.repository';

export type RateLimitRule = {
  /** Name of the rule, part of the stored key (`sign-in:ip:…`). */
  name: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitDecision = { allowed: boolean; retryAfterSeconds: number };

export type RateLimitService = ReturnType<typeof createRateLimitService>;

// Counters older than the longest window are useless.
const RETENTION_MS = 24 * 3600 * 1000;

export function createRateLimitService(deps: {
  repository: RateLimitRepository;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  return {
    async check(rule: RateLimitRule, subject: string): Promise<RateLimitDecision> {
      const { count, resetAt } = await deps.repository.hit(
        `${rule.name}:${subject}`,
        rule.windowSeconds,
      );
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resetAt.getTime() - now().getTime()) / 1000),
      );
      return { allowed: count <= rule.limit, retryAfterSeconds };
    },

    /** Lifts every current limit (rescue CLI: someone locked out, test runs). */
    clearAll(): Promise<void> {
      return deps.repository.deleteAll();
    },

    purgeExpired(): Promise<void> {
      return deps.repository.deleteOlderThan(new Date(now().getTime() - RETENTION_MS));
    },
  };
}
