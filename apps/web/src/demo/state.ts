import type {
  AlarmSettings,
  CookState,
  InstanceSettings,
  Locale,
  LocalizedLabels,
  RecipeVisibility,
  ShoppingState,
  UnitEntry,
} from '@cookit/shared';
import type { InviteRow } from '../../../server/src/modules/invites/invites.repository';

// The whole demo "database": plain objects kept in memory, saved in the browser (IndexedDB)
// after every change. The in-memory repositories (`demo/repositories/`) read and write it with
// the same contracts as the Drizzle ones.

export type DemoUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  username: string;
  displayUsername: string;
  role: 'admin' | 'user';
  locale: Locale;
  listed: boolean;
  disabledAt: Date | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredRecipe = {
  id: string;
  ownerId: string;
  slug: string;
  baseLang: Locale;
  servings: number;
  visibility: RecipeVisibility;
  shareToken: string | null;
  sourceUrl: string | null;
  copiedFromId: string | null;
  copiedFromOwnerId: string | null;
  hasSteps: boolean;
  authorNote: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredTranslation = {
  recipeId: string;
  lang: Locale;
  title: string;
  description: string;
  summary: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  searchText: string;
  updatedAt: Date;
};

export type StoredInvite = InviteRow;

export type DemoState = {
  /** Changes when the shape changes: an older saved state is replaced by a new seed. */
  version: number;
  users: DemoUser[];
  recipes: StoredRecipe[];
  translations: StoredTranslation[];
  recipeTags: { recipeId: string; tagId: string }[];
  notes: { userId: string; recipeId: string; text: string; updatedAt: Date }[];
  saved: { userId: string; recipeId: string; shareToken: string | null; createdAt: Date }[];
  tagCategories: {
    id: string;
    slug: string;
    position: number;
    multiple: boolean;
    labels: LocalizedLabels;
  }[];
  tags: {
    id: string;
    categoryId: string;
    slug: string;
    position: number;
    labels: LocalizedLabels;
  }[];
  units: UnitEntry[];
  settings: InstanceSettings | undefined;
  cookSessions: { userId: string; version: number; updatedAt: Date; state: CookState }[];
  shoppingLists: { userId: string; version: number; updatedAt: Date; state: ShoppingState }[];
  alarms: { userId: string; settings: AlarmSettings; updatedAt: Date }[];
  invites: StoredInvite[];
};

export const STATE_VERSION = 3;

export function emptyState(): DemoState {
  return {
    version: STATE_VERSION,
    users: [],
    recipes: [],
    translations: [],
    recipeTags: [],
    notes: [],
    saved: [],
    tagCategories: [],
    tags: [],
    units: [],
    settings: undefined,
    cookSessions: [],
    shoppingLists: [],
    alarms: [],
    invites: [],
  };
}

// --- Saving in the browser -------------------------------------------------------------------

const DB_NAME = 'cookit-demo';
const STORE = 'state';
const KEY = 'current';

/** Dates are written as ISO strings: read back as `Date` (every `…At` key). */
const reviver = (key: string, value: unknown) =>
  typeof value === 'string' && /At$/.test(key) && /^\d{4}-\d\d-\d\dT/.test(value)
    ? new Date(value)
    : value;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
    });
  } finally {
    db.close();
  }
}

/** The saved state, or undefined (none yet, another version, or no storage in this browser). */
export async function loadState(): Promise<DemoState | undefined> {
  try {
    const text = await run<unknown>('readonly', (store) => store.get(KEY));
    if (typeof text !== 'string') return undefined;
    const state = JSON.parse(text, reviver) as DemoState;
    return state.version === STATE_VERSION ? state : undefined;
  } catch {
    return undefined;
  }
}

export async function saveState(state: DemoState): Promise<void> {
  try {
    await run('readwrite', (store) => store.put(JSON.stringify(state), KEY));
  } catch {
    // Private window or storage refused: the demo still works, only for this visit.
  }
}

export async function clearState(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(KEY));
  } catch {
    // Nothing saved.
  }
}
