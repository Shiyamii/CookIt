import { shoppingStateSchema, type ShoppingListResponse, type ShoppingState } from '@cookit/shared';
import { apiGet, apiPut } from '@/lib/api';
import {
  clearLocalCopies,
  createStateSync,
  loadLocalCopy,
  saveLocalCopy,
  type StateSync,
} from '@/lib/state-sync';
import { EMPTY_LIST } from './list';

export async function fetchList() {
  const { list } = await apiGet<ShoppingListResponse>('/shopping/list');
  return { state: list?.state ?? null, version: list?.version ?? 0 };
}

/** Saves the whole list (something changed); the server gives the next version. */
export function saveList(state: ShoppingState) {
  return apiPut<{ version: number }>('/shopping/list', { state });
}

export type ShoppingSync = StateSync<ShoppingState>;

/**
 * Local copy of the list, per user: usable in the shop without network, sent when it comes back
 * (the last change wins). Removed at sign-out.
 */
const PREFIX = 'cookit:shopping:';
const syncs = new Map<string, ShoppingSync>();

/** One sync per user for the life of the page (the list page, the recipe pages, the home page). */
export function shoppingSyncFor(userId: string): ShoppingSync {
  let sync = syncs.get(userId);
  if (!sync) {
    sync = createStateSync<ShoppingState>({
      load: () => loadLocalCopy(PREFIX + userId, (state) => shoppingStateSchema.safeParse(state)),
      persist: (copy) => saveLocalCopy(PREFIX + userId, copy),
      fetch: fetchList,
      save: saveList,
      // The list is never removed, only emptied.
      clear: () => saveList(EMPTY_LIST),
      empty: EMPTY_LIST,
    });
    syncs.set(userId, sync);
  }
  return sync;
}

/** At sign-out: the next person on this browser starts from the server, with nothing local. */
export function clearShoppingData(): void {
  for (const sync of syncs.values()) sync.dispose();
  syncs.clear();
  clearLocalCopies(PREFIX);
}
