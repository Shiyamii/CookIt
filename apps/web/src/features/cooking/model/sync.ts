import type { CookSessionResponse, CookState } from '@cookit/shared';
import { createStateSync, type StateSync, type SyncSnapshot } from '@/lib/state-sync';
import type { LocalCopy } from './local';
import { EMPTY_STATE } from './session';

/**
 * Keeps the cooking session in sync (plan §5.3) through `createStateSync`: local copy first,
 * then the server, the last change wins. Every answer gives the server time (clock offset).
 */

export type CookSyncSnapshot = SyncSnapshot<CookState>;

type Timed<T> = T & { offset: number };

export type CookSyncDeps = {
  load: () => LocalCopy | undefined;
  persist: (copy: LocalCopy) => void;
  fetchSession: () => Promise<Timed<CookSessionResponse>>;
  saveSession: (state: CookState) => Promise<Timed<{ version: number }>>;
  endSession: () => Promise<Timed<object>>;
};

export function createCookSync(deps: CookSyncDeps): CookSync {
  return createStateSync<CookState>({
    load: deps.load,
    persist: deps.persist,
    fetch: async () => {
      const result = await deps.fetchSession();
      return {
        state: result.session?.state ?? null,
        version: result.session?.version ?? 0,
        offset: result.offset,
      };
    },
    save: deps.saveSession,
    clear: deps.endSession,
    empty: EMPTY_STATE,
  });
}

export type CookSync = StateSync<CookState>;
