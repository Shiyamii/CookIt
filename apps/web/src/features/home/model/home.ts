import type { CookState, Locale, RecipeSummary } from '@cookit/shared';
import { apiGet } from '@/lib/api';

/** The user's local date (`2026-10-22`): the idea of the day changes at their midnight. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The idea of the day; `n` > 0 asks for another one than `exclude` (the one shown). */
export function fetchIdea(
  day: string,
  n: number,
  exclude?: string,
  lang?: Locale,
): Promise<{ recipe: RecipeSummary | null }> {
  const params = new URLSearchParams({ day, n: String(n) });
  if (exclude) params.set('exclude', exclude);
  if (lang) params.set('lang', lang);
  return apiGet(`/recipes/idea?${params.toString()}`);
}

export type CookingSummary = {
  items: { recipeId: string; lang: Locale; color: string; step: number }[];
  /** The running timer that ends first. */
  next: { label: string; recipeTitle: string; endsAt: number } | undefined;
  /** Timers that rang and are not dismissed yet. */
  finished: number;
};

/**
 * What the home page tells about the cooking session in progress: the recipes and their step
 * (1-based), the next timer and how many have finished. `now` is the server's time (corrected
 * device clock). Undefined when nothing is being cooked.
 */
export function cookingSummary(state: CookState | null, now: number): CookingSummary | undefined {
  if (!state || state.items.length === 0) return undefined;
  const timers = state.timers.map((timer) => ({ ...timer, end: Date.parse(timer.endsAt) }));
  const running = timers.filter((timer) => timer.end > now).sort((a, b) => a.end - b.end);
  const next = running[0];
  return {
    items: state.items.map((item) => ({
      recipeId: item.recipeId,
      lang: item.lang,
      color: item.color,
      step: item.currentStep + 1,
    })),
    next: next && {
      label: next.label || next.recipeTitle,
      recipeTitle: next.recipeTitle,
      endsAt: next.end,
    },
    finished: timers.length - running.length,
  };
}
