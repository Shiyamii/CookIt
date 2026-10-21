import {
  composeRecipeMarkdown,
  DEFAULT_UNITS,
  extraMetaSchema,
  parseIngredientLine,
  parseRecipe,
  serializeBody,
  unitIndex,
  type Diagnostic,
  type IngredientGroup,
  type Locale,
  type RecipeDetail,
  type RecipeDocument,
  type RecipeFields,
  type StepGroup,
  type Unit,
} from '@cookit/shared';

/**
 * The visual editor's state. Both editors work on the same text: a row is the text of one
 * ingredient or step as written (`raw`), the visual editor only shows derived fields for it, and
 * the canonical serializer writes the markdown. Switching editors therefore never loses anything:
 * visual → markdown is `toMarkdown`, markdown → visual is `fromMarkdown` (refused while the text
 * has errors).
 */

/** An ingredient or step line, or a line the parser keeps as written (`text`, a "free block"). */
export type EditorRow = { id: string; kind: 'item' | 'text'; raw: string };

export type EditorGroup = {
  id: string;
  /** Group heading; the first group may have none (`undefined`). */
  name: string | undefined;
  rows: EditorRow[];
};

export type EditorMeta = { id: string; key: string; value: string };

export type EditorRecipe = {
  title: string;
  description: string;
  /** As typed: checked on save. */
  servings: string;
  source: string;
  extraMeta: EditorMeta[];
  ingredientGroups: EditorGroup[];
  stepGroups: EditorGroup[];
};

let counter = 0;
/** Ids for React keys and drag and drop; never sent to the server. */
export function newId(): string {
  counter += 1;
  return `e${counter.toString(36)}`;
}

export function emptyRecipe(): EditorRecipe {
  return {
    title: '',
    description: '',
    servings: '4',
    source: '',
    extraMeta: [],
    ingredientGroups: [{ id: newId(), name: undefined, rows: [newRow()] }],
    stepGroups: [{ id: newId(), name: undefined, rows: [newRow()] }],
  };
}

export function newRow(raw = ''): EditorRow {
  return { id: newId(), kind: 'item', raw };
}

function groupsFrom(groups: (IngredientGroup | StepGroup)[]): EditorGroup[] {
  const result = groups.map((group) => ({
    id: newId(),
    name: group.name,
    rows: group.items.map((item): EditorRow => ({
      id: newId(),
      kind: item.kind === 'text' ? 'text' : 'item',
      raw: item.raw,
    })),
  }));
  // An empty part (quick creation) gets one empty line to type into (empty lines are not saved).
  return result.length ? result : [{ id: newId(), name: undefined, rows: [newRow()] }];
}

export function fromDocument(document: RecipeDocument): EditorRecipe {
  return {
    title: document.title,
    description: document.description,
    servings: String(document.servings),
    source: document.source ?? '',
    extraMeta: Object.entries(document.extraMeta).map(([key, value]) => ({
      id: newId(),
      key,
      value,
    })),
    ingredientGroups: groupsFrom(document.ingredientGroups),
    stepGroups: groupsFrom(document.stepGroups),
  };
}

export type ParsedMarkdown =
  | { ok: true; recipe: EditorRecipe; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

/** Markdown → visual editor: only when the text has no error. */
export function fromMarkdown(markdown: string, units?: readonly Unit[]): ParsedMarkdown {
  const result = parseRecipe(markdown, { units });
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics };
  return { ok: true, recipe: fromDocument(result.document), diagnostics: result.diagnostics };
}

/** The markdown document of a stored recipe (what the markdown editor opens). */
export function detailMarkdown(recipe: RecipeDetail): string {
  return composeRecipeMarkdown(
    {
      title: recipe.title,
      description: recipe.description,
      servings: recipe.servings,
      source: recipe.source ?? undefined,
      extraMeta: recipe.extraMeta,
    },
    recipe.body,
    { locale: recipe.lang },
  );
}

export function fromDetail(recipe: RecipeDetail, units?: readonly Unit[]): EditorRecipe {
  const parsed = fromMarkdown(detailMarkdown(recipe), units);
  // A stored recipe always parses (the server checks it on save); keep the columns otherwise.
  if (parsed.ok) return parsed.recipe;
  return { ...emptyRecipe(), title: recipe.title, description: recipe.description };
}

/**
 * Group headings as the serializer needs them: only the first group may have none (a later group
 * without heading would merge into the previous one when read back).
 */
function groupName(group: EditorGroup, index: number): string | undefined {
  const name = group.name?.trim() ?? '';
  if (index === 0 && !name) return undefined;
  return name;
}

/** Rows typed empty are dropped; a row's line breaks become continuation lines. */
function rowsOf(group: EditorGroup) {
  return group.rows.filter((row) => row.raw.trim() !== '');
}

/** Parts 2 and 3 in canonical form (`body_markdown`). */
export function toBody(recipe: EditorRecipe, locale: Locale): string {
  return serializeBody(
    {
      ingredientGroups: recipe.ingredientGroups.map((group, index) => ({
        name: groupName(group, index),
        items: rowsOf(group).map((row) =>
          row.kind === 'text'
            ? { kind: 'text' as const, line: 0, raw: row.raw }
            : { kind: 'ingredient' as const, line: 0, raw: row.raw.trim(), name: '' },
        ),
      })),
      stepGroups: recipe.stepGroups.map((group, index) => ({
        name: groupName(group, index),
        items: rowsOf(group).map((row, i) =>
          row.kind === 'text'
            ? { kind: 'text' as const, line: 0, raw: row.raw }
            : { kind: 'step' as const, line: 0, index: i, raw: row.raw.trim(), segments: [] },
        ),
      })),
    },
    { locale },
  );
}

export type InvalidField = 'title' | 'servings' | 'extraMeta';

/** Part 1 as the API takes it, or the invalid fields. */
export function toFields(
  recipe: EditorRecipe,
): { ok: true; fields: RecipeFields } | { ok: false; invalid: InvalidField[] } {
  const invalid: InvalidField[] = [];
  const title = recipe.title.trim();
  const servings = Number(recipe.servings.trim());
  if (!title) invalid.push('title');
  if (!/^\d+$/.test(recipe.servings.trim()) || servings < 1 || servings > 1000) {
    invalid.push('servings');
  }
  if (invalidMeta(recipe)) invalid.push('extraMeta');
  if (invalid.length) return { ok: false, invalid };
  const extraMeta: Record<string, string> = {};
  for (const meta of recipe.extraMeta) {
    if (meta.key.trim()) extraMeta[meta.key.trim()] = meta.value.trim();
  }
  return {
    ok: true,
    fields: {
      title,
      description: recipe.description.trim(),
      servings,
      source: recipe.source.trim() || undefined,
      extraMeta,
    },
  };
}

/** Visual → markdown: the full document (servings as typed when not a valid number yet). */
export function toMarkdown(recipe: EditorRecipe, locale: Locale): string {
  const extraMeta: Record<string, string> = {};
  for (const meta of recipe.extraMeta) {
    if (meta.key.trim()) extraMeta[meta.key.trim()] = meta.value.trim();
  }
  return composeRecipeMarkdown(
    {
      title: recipe.title.trim(),
      description: recipe.description.trim(),
      servings: Number(recipe.servings) || 0,
      source: recipe.source.trim() || undefined,
      extraMeta,
    },
    toBody(recipe, locale),
    { locale },
  );
}

/** The fields an ingredient row shows: quantity, unit, and the rest of the text. */
export type IngredientParts = { quantity: string; unit: string; rest: string };

export function ingredientParts(raw: string, units?: readonly Unit[]): IngredientParts {
  const { quantity, unit } = parseIngredientLine(raw, unitIndex(units));
  const end = unit?.end ?? quantity?.end ?? 0;
  return {
    quantity: quantity ? raw.slice(quantity.start, quantity.end) : '',
    unit: unit ? raw.slice(unit.start, unit.end) : '',
    rest: raw.slice(end).trim(),
  };
}

/** The row text from its fields (only rebuilt when the user edits one of them). */
export function joinIngredient(parts: IngredientParts): string {
  return [parts.quantity, parts.unit, parts.rest]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

/** Unit suggestions for the ingredient rows: the ways of writing each unit in `locale`. */
export function unitSuggestions(locale: Locale, units: readonly Unit[] = DEFAULT_UNITS): string[] {
  const seen = new Set<string>();
  for (const unit of units) {
    for (const alias of unit.aliases[locale] ?? []) seen.add(alias);
  }
  return [...seen];
}

/** Extra metadata rows the server would refuse (shape of a `key:` line, or a known field). */
export function invalidMeta(recipe: EditorRecipe): boolean {
  const meta: Record<string, string> = {};
  for (const row of recipe.extraMeta) if (row.key.trim()) meta[row.key.trim()] = row.value.trim();
  return !extraMetaSchema.safeParse(meta).success;
}
