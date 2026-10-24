import { DEFAULT_TAG_CATEGORIES, DEFAULT_UNITS, isLocale, type Locale } from '@cookit/shared';
import type { RecipesService } from '../../../server/src/modules/recipes/recipes.service';
import type { TagsService } from '../../../server/src/modules/tags/tags.service';
import { DEMO_LINKS, DEMO_RECIPES, type DemoRecipe } from './recipes';
import { DEMO_USER_IDS } from './session';
import { emptyState, type DemoState, type DemoUser } from './state';

const T0 = new Date('2026-01-15T10:00:00.000Z');

/** The accounts of the demo: the visitor is the member or the admin (demo banner). */
const OWNERS: Record<DemoRecipe['owner'], string> = {
  admin: DEMO_USER_IDS.admin,
  member: DEMO_USER_IDS.member,
  zsofia: '00000000-0000-4000-8000-00000000a003',
  sam: '00000000-0000-4000-8000-00000000a004',
};

function user(id: string, username: string, name: string, extra: Partial<DemoUser> = {}): DemoUser {
  return {
    id,
    name,
    email: `${username.toLowerCase()}@demo.cookit`,
    emailVerified: false,
    image: null,
    username: username.toLowerCase(),
    displayUsername: username,
    role: 'user',
    locale: 'fr',
    listed: true,
    disabledAt: null,
    twoFactorEnabled: false,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  };
}

/** The visitor's language (their browser's), for the accounts they use. */
function visitorLocale(): Locale {
  const found = navigator.languages
    .map((tag) => tag.slice(0, 2).toLowerCase())
    .find((lang) => isLocale(lang));
  return found && isLocale(found) ? found : 'en';
}

/** Accounts, unit and tag catalogs: what the database seeds hold on a new instance. */
export function seedState(): DemoState {
  const state = emptyState();
  // The profile language wins in the app: the visitor's accounts speak their browser's.
  const locale = visitorLocale();
  state.users = [
    user(OWNERS.admin, 'Camille', 'Camille', { role: 'admin', locale }),
    user(OWNERS.member, 'Alex', 'Alex', { locale }),
    user(OWNERS.zsofia, 'Zsofia', 'Zsófia', { locale: 'hu' }),
    user(OWNERS.sam, 'Sam', 'Sam', { locale: 'en', listed: false }),
  ];
  state.units = DEFAULT_UNITS.map((unit, position) => ({
    ...unit,
    id: crypto.randomUUID(),
    position,
  }));
  for (const [position, category] of DEFAULT_TAG_CATEGORIES.entries()) {
    const id = crypto.randomUUID();
    state.tagCategories.push({
      id,
      slug: category.slug,
      position,
      multiple: category.multiple,
      labels: category.labels,
    });
    for (const [tagPosition, tag] of category.tags.entries()) {
      state.tags.push({
        id: crypto.randomUUID(),
        categoryId: id,
        slug: tag.slug,
        position: tagPosition,
        labels: tag.labels,
      });
    }
  }
  // The demo shows public recipes to visitors too.
  state.settings = { publicGallery: true };
  return state;
}

/**
 * The recipes, created through the recipes service (parsed and stored as on a real server), then
 * what the demo member did with the others' recipes: a link, a copy, a note.
 */
export async function seedRecipes(recipes: RecipesService, tags: TagsService): Promise<void> {
  const ids = new Map<string, string>();
  for (const recipe of DEMO_RECIPES) {
    const owner = OWNERS[recipe.owner];
    const created = await recipes.createFromMarkdown(owner, {
      markdown: recipe.markdown,
      lang: recipe.lang,
      tagIds: await tags.idsOfSlugs(recipe.tags),
    });
    if (!('id' in created)) throw new Error(`The demo recipe ${recipe.key} does not parse`);
    ids.set(recipe.key, created.id);
    for (const [lang, markdown] of Object.entries(recipe.translations ?? {})) {
      await recipes.saveTranslation(created.id, owner, lang as DemoRecipe['lang'], markdown);
    }
    if (recipe.authorNote) await recipes.setAuthorNote(created.id, owner, recipe.authorNote);
    await recipes.setVisibility(created.id, owner, recipe.visibility);
  }
  const member = OWNERS.member;
  for (const key of DEMO_LINKS.saved) await recipes.saveLink(ids.get(key) ?? '', member, undefined);
  for (const key of DEMO_LINKS.copied) await recipes.copy(ids.get(key) ?? '', member, undefined);
  for (const [key, text] of Object.entries(DEMO_LINKS.notes)) {
    await recipes.saveNote(ids.get(key) ?? '', member, text);
  }
}
