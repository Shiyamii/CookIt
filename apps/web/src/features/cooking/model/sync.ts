import type { CookSessionResponse, CookState } from '@cookit/shared';
import { ApiError } from '@/lib/api';
import type { LocalCopy } from './local';
import { EMPTY_STATE } from './session';

/**
 * Keeps the cooking session in sync (plan §5.3): every change is applied at once to the local
 * copy, then sent to the server; a change that could not be sent (network cut) stays `dirty` and
 * is sent again on the next `flush` (back online, page visible again). The last change wins.
 * Without pending change, `refresh` takes the server's state (another device may have moved on).
 */

export type CookSyncSnapshot = {
  state: CookState | null;
  version: number;
  /** A change not acknowledged by the server yet. */
  dirty: boolean;
  /** Server clock minus device clock, in ms. */
  offset: number;
  /** The server answered at least once, or could not be reached (the local copy is used). */
  ready: boolean;
  /** The last call failed for lack of network. */
  offline: boolean;
};

type Timed<T> = T & { offset: number };

export type CookSyncDeps = {
  load: () => LocalCopy | undefined;
  persist: (copy: LocalCopy) => void;
  fetchSession: () => Promise<Timed<CookSessionResponse>>;
  saveSession: (state: CookState) => Promise<Timed<{ version: number }>>;
  endSession: () => Promise<Timed<object>>;
};

export function createCookSync(deps: CookSyncDeps) {
  const initial = deps.load();
  let snapshot: CookSyncSnapshot = {
    state: initial?.state ?? null,
    version: initial?.version ?? 0,
    dirty: initial?.dirty ?? false,
    offset: 0,
    ready: false,
    offline: false,
  };
  const listeners = new Set<() => void>();
  let flushing: Promise<void> | undefined;
  /** Local changes so far: a read started before the latest one is out of date. */
  let changes = 0;

  const set = (changes: Partial<CookSyncSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    deps.persist({ state: snapshot.state, version: snapshot.version, dirty: snapshot.dirty });
    for (const listener of listeners) listener();
  };

  /**
   * A change the server refuses as invalid is dropped: its state is taken again. Anything else
   * (no network, signed out, server error) keeps the change for a later try.
   */
  const refused = (error: unknown) =>
    error instanceof ApiError && (error.status === 400 || error.status === 422);

  const send = async () => {
    while (snapshot.dirty) {
      const sent = snapshot.state;
      try {
        const result = sent === null ? await deps.endSession() : await deps.saveSession(sent);
        const version = 'version' in result ? (result.version as number) : snapshot.version;
        // A change made while this one was being sent is still to send.
        set({
          version,
          dirty: snapshot.state !== sent,
          offset: result.offset,
          offline: false,
          ready: true,
        });
      } catch (error) {
        if (refused(error)) {
          set({ dirty: false, offline: false });
          await fetchServer();
        } else {
          set({ offline: true, ready: true });
        }
        return;
      }
    }
  };

  const fetchServer = async () => {
    const changesBefore = changes;
    try {
      const result = await deps.fetchSession();
      // A change made meanwhile (sent or not) wins over what the server had when it was read.
      if (snapshot.dirty || changes !== changesBefore) {
        set({ offset: result.offset, offline: false, ready: true });
        return;
      }
      set({
        state: result.session?.state ?? null,
        version: result.session?.version ?? 0,
        offset: result.offset,
        offline: false,
        ready: true,
      });
    } catch {
      set({ offline: true, ready: true });
    }
  };

  const flush = (): Promise<void> => {
    flushing ??= send().finally(() => {
      flushing = undefined;
    });
    return flushing;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /** On load and when the page comes back: send what is pending, else read the server. */
    async refresh() {
      if (snapshot.dirty) await flush();
      else await fetchServer();
    },

    /** Sends what is pending (back online). */
    flush,

    /** One event: applied locally at once, then sent. */
    update(change: (state: CookState) => CookState) {
      changes += 1;
      set({ state: change(snapshot.state ?? EMPTY_STATE), dirty: true });
      void flush();
    },

    /** Ends the session (sent like any change). */
    end() {
      changes += 1;
      set({ state: null, dirty: true });
      void flush();
    },
  };
}

export type CookSync = ReturnType<typeof createCookSync>;
