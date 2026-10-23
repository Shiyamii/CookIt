import type { Diagnostic } from './diagnostics';

/**
 * Parsed recipe document (format of plan-site-recettes.md §4). Every source line ends up somewhere:
 * lines the parser does not understand are kept as `text` items, never dropped.
 */

/** A number, or a range `2-3` (`max` set). */
export type Amount = { value: number; max?: number };

/** Position of a substring in `raw`: scaling replaces `raw.slice(start, end)` and nothing else. */
export type Span = { start: number; end: number };

/**
 * A number written in the text. For a range, `separator` is the exact text between the two bounds
 * (`-`, ` à `…), kept when the range is scaled.
 */
export type Quantity = Span & { amount: Amount; separator?: string };

/** A catalog unit recognized in the text; the text written stays as is. */
export type UnitMatch = Span & { slug: string };

export type IngredientItem = {
  kind: 'ingredient';
  /** 1-based source line. */
  line: number;
  /** Item text as written, without the list marker. */
  raw: string;
  quantity?: Quantity;
  unit?: UnitMatch;
  /** What the ingredient is (`farine` in `250 g de farine`); the whole text without quantity. */
  name: string;
};

/** A line kept as written (unparsable line, paragraph, quote…). */
export type TextItem = { kind: 'text'; line: number; raw: string };

export type IngredientGroup = {
  /** `### Group` heading (`''` for an empty `###`); undefined for the leading group without heading. */
  name?: string;
  items: (IngredientItem | TextItem)[];
};

/** A step split around its special links. `text` segments are markdown, as written. */
export type InlineSegment =
  | { kind: 'text'; text: string }
  /** `[10 min](timer:10m "label")`. Durations are never scaled. `text` is the link text. */
  | { kind: 'timer'; text: string; seconds: number; label: string }
  /** `[2 tbsp](q:)`: follows serving scaling. Spans are relative to `text`, the link text. */
  | { kind: 'quantity'; text: string; quantity: Quantity; unit?: UnitMatch };

export type StepItem = {
  kind: 'step';
  line: number;
  /** Global step number in order of appearance (0-based), kept by cook sessions. */
  index: number;
  raw: string;
  segments: InlineSegment[];
};

export type StepGroup = { name?: string; items: (StepItem | TextItem)[] };

/** Part 1 of the document. In the database: real columns, the source of truth. */
export type Presentation = {
  title: string;
  /** Markdown text, quote markers (`> `) removed. */
  description: string;
  servings: number;
  /** One line shown on the cards of the lists (`summary:` / `résumé:`). */
  summary?: string;
  source?: string;
  format?: number;
  /** Neutral tag ids, only in exchanges (export / import), never in the markdown editor. */
  tags: string[];
  /** Unknown `key: value` lines of part 1, kept as written. */
  extraMeta: Record<string, string>;
};

export type RecipeDocument = Presentation & {
  ingredientGroups: IngredientGroup[];
  stepGroups: StepGroup[];
};

export type ParseResult =
  | { ok: true; document: RecipeDocument; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };
