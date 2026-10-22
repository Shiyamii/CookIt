import { cookStateSchema, type CookState } from '@cookit/shared';
import {
  clearLocalCopies as clearCopies,
  loadLocalCopy as loadCopy,
  saveLocalCopy as saveCopy,
  type LocalCopy as StateCopy,
} from '@/lib/state-sync';

/**
 * Local copy of the cooking session (plan §5.3), per user: shown at once, kept through network
 * cuts. `dirty` means it holds a change the server has not acknowledged yet; it is sent again as
 * soon as possible (the last change wins). Removed at sign-out, like drafts.
 */

export type LocalCopy = StateCopy<CookState>;

const PREFIX = 'cookit:cook:';

export function loadLocalCopy(userId: string): LocalCopy | undefined {
  return loadCopy(PREFIX + userId, (state) => cookStateSchema.safeParse(state));
}

export function saveLocalCopy(userId: string, copy: LocalCopy): void {
  saveCopy(PREFIX + userId, copy);
}

/**
 * The recipe shown on this device (one tab per recipe): a choice of the device, not of the
 * session, so two devices can each follow their own recipe.
 */
export function loadActiveRecipe(userId: string): string | undefined {
  try {
    return localStorage.getItem(`${PREFIX}active:${userId}`) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveActiveRecipe(userId: string, recipeId: string): void {
  try {
    localStorage.setItem(`${PREFIX}active:${userId}`, recipeId);
  } catch {
    // Not kept: the first recipe is shown after a reload.
  }
}

/** At sign-out: another person may use this browser next. */
export function clearLocalCopies(): void {
  clearCopies(PREFIX);
}
