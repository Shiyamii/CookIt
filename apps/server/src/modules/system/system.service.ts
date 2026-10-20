import { APP_NAME, SUPPORTED_LOCALES } from '@cookit/shared';
import type { SystemRepository } from './system.repository';

export type SystemService = ReturnType<typeof createSystemService>;

export function createSystemService(deps: { repository: SystemRepository; version: string }) {
  return {
    async isHealthy(): Promise<boolean> {
      try {
        await deps.repository.ping();
        return true;
      } catch {
        return false;
      }
    },

    meta() {
      return { name: APP_NAME, version: deps.version, locales: SUPPORTED_LOCALES };
    },
  };
}
