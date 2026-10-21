import { cookStateSchema, type CookState } from '@cookit/shared';

/**
 * Local copy of the cooking session (plan §5.3), per user: shown at once, kept through network
 * cuts. `dirty` means it holds a change the server has not acknowledged yet; it is sent again as
 * soon as possible (the last change wins). Removed at sign-out, like drafts.
 */

export type LocalCopy = { state: CookState | null; version: number; dirty: boolean };

const PREFIX = 'cookit:cook:';

export function loadLocalCopy(userId: string): LocalCopy | undefined {
  try {
    const value = localStorage.getItem(PREFIX + userId);
    if (!value) return undefined;
    const data = JSON.parse(value) as Partial<LocalCopy>;
    const state =
      data.state === null
        ? { success: true as const, data: null }
        : cookStateSchema.safeParse(data.state);
    if (!state.success || typeof data.version !== 'number' || typeof data.dirty !== 'boolean') {
      return undefined;
    }
    return { state: state.data, version: data.version, dirty: data.dirty };
  } catch {
    return undefined;
  }
}

export function saveLocalCopy(userId: string, copy: LocalCopy): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(copy));
  } catch {
    // Storage full or blocked: the server keeps the session.
  }
}

/** At sign-out: another person may use this browser next. */
export function clearLocalCopies(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do.
  }
}
