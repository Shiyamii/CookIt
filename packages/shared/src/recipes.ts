import { z } from 'zod';
import { labelString } from './labels';
import { SUPPORTED_LOCALES, type Locale } from './locale';
import { metaFieldOf } from './recipe/meta-keys';
import type { Presentation } from './recipe/model';
import { MAX_SERVINGS } from './recipe/presentation';
import { serializePresentation } from './recipe/serialize';
import { MAX_RECIPE_MARKDOWN_LENGTH } from './recipe/split';
import { recipeTagIdsSchema } from './tags';

// Recipes API (phase 4). Part 1 of a recipe lives in real columns; parts 2 and 3 in
// `bodyMarkdown` (serializeBody). The full document is only composed for the markdown editor and
// exports (composeRecipeMarkdown).

export const RECIPE_VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type RecipeVisibility = (typeof RECIPE_VISIBILITIES)[number];

export const RECIPE_TITLE_MAX = 200;
export const RECIPE_DESCRIPTION_MAX = 10_000;
export const RECIPE_SOURCE_MAX = 2000;
export const RECIPE_EXTRA_META_MAX = 50;
export const RECIPE_SEARCH_MAX = 200;
export const RECIPES_PAGE_SIZE = 24;

/** Same key shape as the parser reads (`key: value` in part 1): a letter, then no spaces. */
const META_KEY = /^\p{L}[\p{L}\p{M}\p{N}_-]*$/u;

/** Multi-line markdown text: line breaks and tabs allowed, other control characters refused. */
const multiLine = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\p{Bidi_Control}]|(?![\n\t])\p{Cc}/u.test(value), {
      message: 'Control characters are not allowed',
    });

/**
 * Unknown `key: value` lines of part 1, kept as written. Keys and values are single lines, and a
 * key may not be a known field (`portions`, `tags`, `format`…): it would be read back as that field.
 */
export const extraMetaSchema = z
  .record(
    labelString(100)
      .regex(META_KEY)
      .refine((key) => metaFieldOf(key) === undefined, { message: 'Reserved key' }),
    z
      .string()
      .trim()
      .max(1000)
      .refine((value) => !/[\p{Cc}\p{Bidi_Control}]/u.test(value), {
        message: 'Control characters are not allowed',
      }),
  )
  .refine((meta) => Object.keys(meta).length <= RECIPE_EXTRA_META_MAX, {
    message: 'Too many entries',
  });

/** Part 1 as edited in the visual editor (the columns). */
export const recipeFieldsSchema = z.object({
  title: labelString(RECIPE_TITLE_MAX),
  description: multiLine(RECIPE_DESCRIPTION_MAX).transform((value) => value.trim()),
  servings: z.number().int().min(1).max(MAX_SERVINGS),
  source: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    labelString(RECIPE_SOURCE_MAX).optional(),
  ),
  extraMeta: extraMetaSchema.default({}),
});
export type RecipeFields = z.infer<typeof recipeFieldsSchema>;

/** Parts 2 and 3 (`serializeBody`), checked by parsing on the server. */
export const recipeBodySchema = z.string().max(MAX_RECIPE_MARKDOWN_LENGTH);

/** Optimistic concurrency: the `updatedAt` the editor started from (refused if it changed). */
const baseVersion = z.iso.datetime({ offset: true }).optional();

/** Visual editor: columns + body. `lang` only on creation (the recipe's base language). */
export const recipeSaveInputSchema = recipeFieldsSchema
  .extend({ body: recipeBodySchema, baseVersion, tagIds: recipeTagIdsSchema.optional() })
  .strict();
export type RecipeSaveInput = z.infer<typeof recipeSaveInputSchema>;

export const recipeCreateInputSchema = recipeFieldsSchema
  .extend({
    body: recipeBodySchema,
    lang: z.enum(SUPPORTED_LOCALES),
    tagIds: recipeTagIdsSchema.optional(),
  })
  .strict();
export type RecipeCreateInput = z.infer<typeof recipeCreateInputSchema>;

/**
 * Markdown editor: the full document, split and parsed by the server. Tags are never in the
 * editable text (plan §4): the editor sends the ones chosen in its tag pickers, if any.
 */
export const recipeMarkdownInputSchema = z
  .object({
    markdown: z.string().min(1).max(MAX_RECIPE_MARKDOWN_LENGTH),
    baseVersion,
    tagIds: recipeTagIdsSchema.optional(),
  })
  .strict();
export type RecipeMarkdownInput = z.infer<typeof recipeMarkdownInputSchema>;

export const recipeMarkdownCreateInputSchema = z
  .object({
    markdown: z.string().min(1).max(MAX_RECIPE_MARKDOWN_LENGTH),
    lang: z.enum(SUPPORTED_LOCALES),
    tagIds: recipeTagIdsSchema.optional(),
  })
  .strict();

export const recipeVisibilityInputSchema = z
  .object({ visibility: z.enum(RECIPE_VISIBILITIES) })
  .strict();

/** An unlisted recipe's share token: 32 random bytes in base64url (as link tokens). */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const sharedRecipeInputSchema = z.object({ token: shareTokenSchema }).strict();

/** "Add to my library": the share token is needed for an unlisted recipe. */
export const recipeCopyInputSchema = z.object({ token: shareTokenSchema.optional() }).strict();

export const recipeSearchSchema = z.object({
  q: z.string().trim().max(RECIPE_SEARCH_MAX).optional(),
  /** Tag slugs, comma-separated: recipes having all of them. */
  tags: z
    .string()
    .max(1000)
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((slug) => slug.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
export type RecipeSearch = z.infer<typeof recipeSearchSchema>;

/** A recipe in a list (my recipes, gallery). */
export type RecipeSummary = {
  id: string;
  lang: Locale;
  title: string;
  description: string;
  servings: number;
  visibility: RecipeVisibility;
  ownerName: string;
  updatedAt: string;
};

export type RecipePage = { recipes: RecipeSummary[]; hasMore: boolean };

/** A recipe as read by the view and the editors (base language only until phase 5b). */
export type RecipeDetail = {
  id: string;
  lang: Locale;
  title: string;
  description: string;
  servings: number;
  source: string | null;
  extraMeta: Record<string, string>;
  /** Parts 2 and 3 (serializeBody). */
  body: string;
  visibility: RecipeVisibility;
  ownerName: string;
  isOwner: boolean;
  /** Only for the owner of an unlisted recipe. */
  shareUrl: string | null;
  /** Set when this recipe was copied from another one ("add to my library"). */
  copiedFromId: string | null;
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
};

/** Errors returned by the recipes API as `{ error }`, translated by the UI. */
export const RECIPE_ERRORS = ['not_found', 'invalid_recipe', 'conflict'] as const;

/**
 * The full markdown document of a recipe (format of §4) from its columns and body, for the
 * markdown editor (no `tags:` line) and exports.
 */
export function composeRecipeMarkdown(
  fields: Pick<Presentation, 'title' | 'description' | 'servings' | 'source' | 'extraMeta'> & {
    tags?: string[];
  },
  body: string,
  options: { locale: Locale; includeTags?: boolean },
): string {
  const presentation = serializePresentation(
    { ...fields, tags: fields.tags ?? [], format: undefined },
    options,
  );
  return `${presentation}\n\n---\n\n${body}\n`;
}
