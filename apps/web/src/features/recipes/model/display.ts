import {
  parseRecipe,
  scaleFactor,
  scaleIngredient,
  scaleSegment,
  type Locale,
  type RecipeDocument,
  type Unit,
} from '@cookit/shared';
import { detailMarkdown } from './editor';
import type { RecipeDetail } from '@cookit/shared';

/** What the recipe page shows, already scaled to the wanted servings. */
export type DisplaySegment =
  /** Markdown text, rendered with the safe inline renderer. */
  | { kind: 'text'; markdown: string }
  | { kind: 'timer'; text: string; label: string; seconds: number }
  | { kind: 'quantity'; text: string };

export type DisplayIngredient = { kind: 'ingredient' | 'text'; text: string };
export type DisplayStep =
  { kind: 'step'; number: number; segments: DisplaySegment[] } | { kind: 'text'; text: string };

export type DisplayRecipe = {
  title: string;
  description: string;
  servings: number;
  source: string | null;
  extraMeta: [string, string][];
  ingredientGroups: { name?: string; items: DisplayIngredient[] }[];
  stepGroups: { name?: string; items: DisplayStep[] }[];
  /** No step yet: the recipe is still to be completed. */
  empty: boolean;
};

export function parseDetail(
  recipe: RecipeDetail,
  units?: readonly Unit[],
): RecipeDocument | undefined {
  const result = parseRecipe(detailMarkdown(recipe), { units });
  return result.ok ? result.document : undefined;
}

/** The recipe for `servings` (quantities scaled, timers never). */
export function displayRecipe(
  document: RecipeDocument,
  servings: number,
  locale: Locale,
  units?: readonly Unit[],
): DisplayRecipe {
  const factor = scaleFactor(document.servings, servings);
  const options = { locale, units };
  let number = 0;
  const stepGroups = document.stepGroups.map((group) => ({
    name: group.name,
    items: group.items.map((item): DisplayStep => {
      if (item.kind === 'text') return { kind: 'text', text: item.raw };
      number += 1;
      return {
        kind: 'step',
        number,
        segments: item.segments.map((segment): DisplaySegment => {
          if (segment.kind === 'text') return { kind: 'text', markdown: segment.text };
          if (segment.kind === 'timer') {
            return {
              kind: 'timer',
              text: segment.text,
              label: segment.label,
              seconds: segment.seconds,
            };
          }
          return { kind: 'quantity', text: scaleSegment(segment, factor, options) };
        }),
      };
    }),
  }));
  return {
    title: document.title,
    description: document.description,
    servings,
    source: document.source ?? null,
    extraMeta: Object.entries(document.extraMeta),
    ingredientGroups: document.ingredientGroups.map((group) => ({
      name: group.name,
      items: group.items.map((item) =>
        item.kind === 'text'
          ? { kind: 'text' as const, text: item.raw }
          : { kind: 'ingredient' as const, text: scaleIngredient(item, factor, options) },
      ),
    })),
    stepGroups,
    empty: number === 0,
  };
}

/** A source is a link only for http(s) URLs; anything else is shown as text (security checklist). */
export function sourceLink(source: string | null): string | undefined {
  if (!source) return undefined;
  try {
    const url = new URL(source);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** `5400` → `1 h 30`, `600` → `10 min`, `45` → `45 s`. */
export function durationText(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours) return minutes ? `${hours} h ${String(minutes).padStart(2, '0')}` : `${hours} h`;
  if (minutes) return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  return `${rest} s`;
}
