import { APP_NAME, SUPPORTED_LOCALES, type InstanceSettings } from '@cookit/shared';
import type { SystemRepository } from './system.repository';

export type SystemService = ReturnType<typeof createSystemService>;

/** Until an admin changes them: recipes are for members only. */
export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = { publicGallery: false };

export function createSystemService(deps: {
  repository: SystemRepository;
  version: string;
  /** Email is configured: the app offers to send invites and reset links. */
  email?: boolean;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());
  // Read on every anonymous recipe request: kept in memory, replaced when an admin saves.
  let cached: Promise<InstanceSettings> | undefined;
  const settings = () => {
    cached ??= deps.repository
      .findSettings()
      .then((found) => found ?? DEFAULT_INSTANCE_SETTINGS)
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };

  return {
    async isHealthy(): Promise<boolean> {
      try {
        await deps.repository.ping();
        return true;
      } catch {
        return false;
      }
    },

    async meta() {
      return {
        name: APP_NAME,
        version: deps.version,
        locales: SUPPORTED_LOCALES,
        email: deps.email ?? false,
        publicGallery: (await settings()).publicGallery,
      };
    },

    settings,

    /** Public recipes readable without an account. */
    publicGallery: async () => (await settings()).publicGallery,

    async saveSettings(input: InstanceSettings): Promise<InstanceSettings> {
      await deps.repository.saveSettings(input, now());
      cached = Promise.resolve(input);
      return input;
    },
  };
}
