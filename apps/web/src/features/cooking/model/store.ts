import { endSession, fetchSession, saveSession } from './cooking';
import {
  clearLocalCopies,
  loadActiveRecipe,
  loadLocalCopy,
  saveActiveRecipe,
  saveLocalCopy,
} from './local';
import { createCookSync, type CookSync } from './sync';

const syncs = new Map<string, CookSync>();

/** One sync per user for the life of the page: it survives leaving the cooking page and coming back. */
export function cookSyncFor(userId: string): CookSync {
  let sync = syncs.get(userId);
  if (!sync) {
    sync = createCookSync({
      load: () => loadLocalCopy(userId),
      persist: (copy) => saveLocalCopy(userId, copy),
      fetchSession,
      saveSession,
      endSession,
    });
    syncs.set(userId, sync);
  }
  return sync;
}

const active = new Map<string, string>();
const activeListeners = new Set<() => void>();

/** The recipe shown on this device, per user (kept in memory when storage is blocked). */
export const activeRecipe = {
  subscribe(listener: () => void) {
    activeListeners.add(listener);
    return () => activeListeners.delete(listener);
  },
  get: (userId: string): string | undefined => active.get(userId) ?? loadActiveRecipe(userId),
  set(userId: string, recipeId: string) {
    active.set(userId, recipeId);
    saveActiveRecipe(userId, recipeId);
    for (const listener of activeListeners) listener();
  },
};

/** At sign-out: the next person on this browser starts from the server, with nothing local. */
export function clearCookingData(): void {
  for (const sync of syncs.values()) sync.dispose();
  syncs.clear();
  active.clear();
  clearLocalCopies();
}
