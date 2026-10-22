import { ApiError } from '@/lib/api';

/**
 * Keeps a user's state in sync with the server (cooking session, shopping list): every change is
 * applied at once to the local copy, then sent to the server; a change that could not be sent
 * (network cut) stays `dirty` and is sent again on the next `flush` (back online, page visible
 * again). The last change wins. Without pending change, `refresh` takes the server's state
 * (another device may have moved on).
 */

export type SyncSnapshot<S> = {
  state: S | null;
  version: number;
  /** A change not acknowledged by the server yet. */
  dirty: boolean;
  /** Server clock minus device clock, in ms (0 when the server does not give its time). */
  offset: number;
  /** The server answered at least once, or could not be reached (the local copy is used). */
  ready: boolean;
  /** The last call failed for lack of network. */
  offline: boolean;
};

/** What is kept in the browser. */
export type LocalCopy<S> = { state: S | null; version: number; dirty: boolean };

export type StateSyncDeps<S> = {
  load: () => LocalCopy<S> | undefined;
  persist: (copy: LocalCopy<S>) => void;
  fetch: () => Promise<{ state: S | null; version: number; offset?: number }>;
  save: (state: S) => Promise<{ version: number; offset?: number }>;
  /** Removes the state on the server (`end`). */
  clear: () => Promise<{ version?: number; offset?: number }>;
  /** What `update` starts from when there is no state. */
  empty: S;
};

export function createStateSync<S>(deps: StateSyncDeps<S>) {
  const initial = deps.load();
  let snapshot: SyncSnapshot<S> = {
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

  /** Set at sign-out: a call still in flight must not write the list back to the browser. */
  let disposed = false;

  const set = (changes: Partial<SyncSnapshot<S>>) => {
    if (disposed) return;
    snapshot = { ...snapshot, ...changes };
    deps.persist({ state: snapshot.state, version: snapshot.version, dirty: snapshot.dirty });
    for (const listener of listeners) listener();
  };

  /**
   * A change the server refuses as invalid (or too large) is dropped: its state is taken again.
   * Anything else (no network, signed out, server error) keeps the change for a later try.
   */
  const refused = (error: unknown) =>
    error instanceof ApiError && [400, 413, 422].includes(error.status);

  const send = async () => {
    while (snapshot.dirty && !disposed) {
      const sent = snapshot.state;
      try {
        const result = sent === null ? await deps.clear() : await deps.save(sent);
        const version = result.version ?? snapshot.version;
        // A change made while this one was being sent is still to send.
        set({
          version,
          dirty: snapshot.state !== sent,
          offset: result.offset ?? snapshot.offset,
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
      const result = await deps.fetch();
      const offset = result.offset ?? snapshot.offset;
      // A change made meanwhile (sent or not) wins over what the server had when it was read.
      if (snapshot.dirty || changes !== changesBefore) {
        set({ offset, offline: false, ready: true });
        return;
      }
      set({
        state: result.state,
        version: result.version,
        offset,
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

    /** At sign-out: nothing is saved, sent or kept by this sync any more. */
    dispose() {
      disposed = true;
      listeners.clear();
    },
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
    update(change: (state: S) => S) {
      changes += 1;
      set({ state: change(snapshot.state ?? deps.empty), dirty: true });
      void flush();
    },

    /** Removes the state (sent like any change). */
    end() {
      changes += 1;
      set({ state: null, dirty: true });
      void flush();
    },
  };
}

export type StateSync<S> = ReturnType<typeof createStateSync<S>>;

/** Reads a local copy written by `saveLocalCopy`; anything unreadable is ignored. */
export function loadLocalCopy<S>(
  key: string,
  parse: (state: unknown) => { success: true; data: S } | { success: false },
): LocalCopy<S> | undefined {
  try {
    const value = localStorage.getItem(key);
    if (!value) return undefined;
    const data = JSON.parse(value) as Partial<LocalCopy<unknown>>;
    const state = data.state === null ? { success: true as const, data: null } : parse(data.state);
    if (!state.success || typeof data.version !== 'number' || typeof data.dirty !== 'boolean') {
      return undefined;
    }
    return { state: state.data, version: data.version, dirty: data.dirty };
  } catch {
    return undefined;
  }
}

export function saveLocalCopy<S>(key: string, copy: LocalCopy<S>): void {
  try {
    localStorage.setItem(key, JSON.stringify(copy));
  } catch {
    // Storage full or blocked: the server keeps the state.
  }
}

/** At sign-out: another person may use this browser next. */
export function clearLocalCopies(prefix: string): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do.
  }
}
