import { endSession, fetchSession, saveSession } from './cooking';
import { clearLocalCopies, loadLocalCopy, saveLocalCopy } from './local';
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

/** At sign-out: the next person on this browser starts from the server, with nothing local. */
export function clearCookingData(): void {
  syncs.clear();
  clearLocalCopies();
}
