import { z } from 'zod';
import { localizedLabelsSchema, type LocalizedLabels } from './labels';
import { SUPPORTED_LOCALES, type Locale } from './locale';
import { fold } from './text';

// Tag categories and tags (plan §4): a common list managed by the admin. Recipes only reference
// neutral ids; labels are translated JSON objects, so adding a language needs no migration.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const slugSchema = z.string().trim().min(1).max(50).regex(SLUG_PATTERN);

/** At most this many tags on one recipe. */
export const MAX_RECIPE_TAGS = 30;

export const tagCategoryInputSchema = z
  .object({ slug: slugSchema, labels: localizedLabelsSchema, multiple: z.boolean() })
  .strict();
export type TagCategoryInput = z.infer<typeof tagCategoryInputSchema>;

export const tagInputSchema = z
  .object({ slug: slugSchema, categoryId: z.uuid(), labels: localizedLabelsSchema })
  .strict();
export type TagInput = z.infer<typeof tagInputSchema>;

/** New order of the categories, or of the tags of one category (all their ids). */
export const reorderInputSchema = z.object({ ids: z.array(z.uuid()).min(1).max(500) }).strict();

/** Deleting a tag used by recipes: confirmed, or merged into another tag. */
export const tagDeleteInputSchema = z
  .object({ confirm: z.boolean().optional(), mergeInto: z.uuid().optional() })
  .strict();

export const recipeTagIdsSchema = z.array(z.uuid()).max(MAX_RECIPE_TAGS);

export type Tag = {
  id: string;
  slug: string;
  categoryId: string;
  position: number;
  labels: LocalizedLabels;
};

export type TagCategory = {
  id: string;
  slug: string;
  position: number;
  /** Several tags of this category allowed on one recipe. */
  multiple: boolean;
  labels: LocalizedLabels;
  tags: Tag[];
};

/** A tag as admins see it: how many recipes use it (to confirm a deletion). */
export type AdminTag = Tag & { recipeCount: number };
export type AdminTagCategory = Omit<TagCategory, 'tags'> & { tags: AdminTag[] };

/** Errors of the tags and units admin API (`{ error }`), translated by the UI. */
export const CATALOG_ERRORS = [
  'slug_taken',
  'alias_conflict',
  'tag_in_use',
  'category_not_empty',
  'invalid_tags',
] as const;

/**
 * The label to show: the interface language, then the other languages in order, then the slug.
 */
export function labelFor(labels: LocalizedLabels, locale: Locale, fallback: string): string {
  const order = [locale, ...SUPPORTED_LOCALES.filter((other) => other !== locale)];
  for (const lang of order) {
    const label = labels[lang];
    if (label) return label;
  }
  return fallback;
}

/** Ids of the tags whose slug or label (any language) matches `value`, ignoring case and accents. */
export function matchTags(categories: readonly TagCategory[], value: string): Tag[] {
  const wanted = fold(value.trim());
  if (!wanted) return [];
  const tags = categories.flatMap((category) => category.tags);
  const bySlug = tags.filter((tag) => tag.slug === wanted);
  if (bySlug.length) return bySlug;
  return tags.filter((tag) =>
    Object.values(tag.labels).some((label) => label !== undefined && fold(label) === wanted),
  );
}

/** Starting categories and tags (plan §4), created once; the admin edits them afterwards. */
export const DEFAULT_TAG_CATEGORIES: {
  slug: string;
  multiple: boolean;
  labels: LocalizedLabels;
  tags: { slug: string; labels: LocalizedLabels }[];
}[] = [
  {
    slug: 'type-de-plat',
    multiple: false,
    labels: { fr: 'Type de plat', en: 'Dish type' },
    tags: [
      { slug: 'entree', labels: { fr: 'Entrée', en: 'Starter' } },
      { slug: 'plat-principal', labels: { fr: 'Plat principal', en: 'Main course' } },
      { slug: 'accompagnement', labels: { fr: 'Accompagnement', en: 'Side dish' } },
      { slug: 'dessert', labels: { fr: 'Dessert', en: 'Dessert' } },
      { slug: 'boisson', labels: { fr: 'Boisson', en: 'Drink' } },
      { slug: 'sauce', labels: { fr: 'Sauce', en: 'Sauce' } },
      { slug: 'petit-dejeuner', labels: { fr: 'Petit-déjeuner', en: 'Breakfast' } },
      { slug: 'aperitif', labels: { fr: 'Apéritif', en: 'Appetizer' } },
    ],
  },
  {
    slug: 'regime',
    multiple: true,
    labels: { fr: 'Régime', en: 'Diet' },
    tags: [
      { slug: 'vegetarien', labels: { fr: 'Végétarien', en: 'Vegetarian' } },
      { slug: 'vegetalien', labels: { fr: 'Végétalien', en: 'Vegan' } },
      { slug: 'sans-gluten', labels: { fr: 'Sans gluten', en: 'Gluten-free' } },
      { slug: 'sans-lactose', labels: { fr: 'Sans lactose', en: 'Lactose-free' } },
    ],
  },
  {
    slug: 'cuisine',
    multiple: true,
    labels: { fr: 'Cuisine', en: 'Cuisine' },
    tags: [
      { slug: 'francaise', labels: { fr: 'Française', en: 'French' } },
      { slug: 'italienne', labels: { fr: 'Italienne', en: 'Italian' } },
      { slug: 'asiatique', labels: { fr: 'Asiatique', en: 'Asian' } },
      { slug: 'mexicaine', labels: { fr: 'Mexicaine', en: 'Mexican' } },
      { slug: 'orientale', labels: { fr: 'Orientale', en: 'Middle Eastern' } },
    ],
  },
];
