/**
 * Unsaved edits kept in the browser (plan §5.2: "brouillon conservé localement"), per user and
 * recipe (`new` for a recipe not created yet): another account on the same browser never sees
 * them, and they are removed when another account opens the editor or at sign-out. Only a
 * convenience: storage can be unavailable or full (private windows), so every access is guarded
 * and losing a draft is never an error.
 */

export type Draft = {
  /** What the editor showed: the visual editor's markdown, or the markdown editor's text. */
  markdown: string;
  /** The recipe version the draft started from (none for a new recipe). */
  baseVersion?: string;
  /** Tags chosen in the editor (they are not part of the markdown). */
  tagIds?: string[];
  savedAt: string;
};

const PREFIX = 'cookit:draft:';
/** Drafts are personal: they are cleared at sign-out (see clearDrafts). */
const MAX_LENGTH = 250_000;

export function loadDraft(key: string): Draft | undefined {
  try {
    const value = localStorage.getItem(PREFIX + key);
    if (!value) return undefined;
    const draft = JSON.parse(value) as Partial<Draft>;
    if (typeof draft.markdown !== 'string' || typeof draft.savedAt !== 'string') return undefined;
    return draft as Draft;
  } catch {
    return undefined;
  }
}

export function saveDraft(key: string, draft: Draft): void {
  try {
    if (draft.markdown.length > MAX_LENGTH) return;
    localStorage.setItem(PREFIX + key, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft is only a convenience.
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to do.
  }
}

/** The storage key of a draft: `<userId>:<recipe id | new>`. */
export function draftKey(userId: string, recipeId: string | undefined): string {
  return `${userId}:${recipeId ?? 'new'}`;
}

/** Drafts left by other accounts (a session that ended without signing out). */
export function clearOtherUsersDrafts(userId: string): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX) && !key.startsWith(`${PREFIX}${userId}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Nothing to do.
  }
}

/** At sign-out: another person may use this browser next. */
export function clearDrafts(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do.
  }
}

/** A draft that is not markdown (the wizard's state), under the same rules. */
export function loadJsonDraft<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function saveJsonDraft(key: string, value: unknown): void {
  try {
    const json = JSON.stringify(value);
    if (json.length <= MAX_LENGTH) localStorage.setItem(PREFIX + key, json);
  } catch {
    // Storage full or blocked: the draft is only a convenience.
  }
}
