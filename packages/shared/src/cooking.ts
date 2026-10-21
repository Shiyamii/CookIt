import { z } from 'zod';
import { SUPPORTED_LOCALES } from './locale';
import { MAX_TIMER_SECONDS } from './recipe/inline';
import { MAX_SERVINGS } from './recipe/presentation';

// Cooking mode (plan §5.3, phase 6). The state of a cooking session is saved by the server at
// every event (step changed, ingredient checked, timer started or cancelled), never continuously,
// and kept in the browser for network cuts. Last change wins: each save gets the next `version`.

/** Colors of the recipes of a session: theme tokens (`bg-chart-1`…), never hard-coded colors. */
export const COOK_COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const;
export type CookColor = (typeof COOK_COLORS)[number];

/** Recipes cooked at once: one color each. */
export const MAX_COOK_ITEMS = COOK_COLORS.length;
export const MAX_COOK_TIMERS = 50;
const MAX_STEPS = 10_000;

/** A short single-line text that may be empty (a timer without a name). */
const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // Lone surrogates (half of a cut emoji) too: Postgres refuses them in JSONB.
    .refine((value) => !/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}\p{Cs}]/u.test(value), {
      message: 'Control characters are not allowed',
    });

/**
 * A timer's name or dish name as the state accepts it: they come from recipe texts written by
 * anyone (a `timer:` title may hold tabs, line breaks or bidi controls), so they are cleaned and
 * cut by code points rather than refused.
 */
export function cookText(value: string, max = 200): string {
  const clean = value
    .replace(/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(clean).slice(0, max).join('').trim();
}

/** A recipe being cooked: its language, servings, current step (global index) and checked ingredients. */
export const cookItemSchema = z
  .object({
    recipeId: z.uuid(),
    lang: z.enum(SUPPORTED_LOCALES),
    servings: z.number().int().min(1).max(MAX_SERVINGS),
    /** Global step index, in order of appearance across groups (plan §4). */
    currentStep: z.number().int().min(0).max(MAX_STEPS),
    /** Global ingredient indexes. */
    checkedIngredients: z.array(z.number().int().min(0).max(MAX_STEPS)).max(1000),
    color: z.enum(COOK_COLORS),
  })
  .strict();
export type CookItem = z.infer<typeof cookItemSchema>;

/**
 * A running timer: an absolute end time, never a decreasing remaining time (plan §3). A finished
 * timer stays until it is dismissed; a cancelled or dismissed one leaves the state.
 */
export const cookTimerSchema = z
  .object({
    id: z.uuid(),
    recipeId: z.uuid().nullable(),
    /** Name of the dish (notifications, timer bar). */
    recipeTitle: shortText(200),
    label: shortText(200),
    durationSeconds: z.number().int().min(1).max(MAX_TIMER_SECONDS),
    endsAt: z.iso.datetime({ offset: true }),
    /** The step and the timer of that step it was started from, if any. */
    step: z.number().int().min(0).max(MAX_STEPS).nullable(),
    slot: z.number().int().min(0).max(1000).nullable(),
  })
  .strict();
export type CookTimer = z.infer<typeof cookTimerSchema>;

export const cookStateSchema = z
  .object({
    items: z
      .array(cookItemSchema)
      .max(MAX_COOK_ITEMS)
      .refine((items) => new Set(items.map((item) => item.recipeId)).size === items.length, {
        message: 'A recipe is only once in a session',
      }),
    timers: z
      .array(cookTimerSchema)
      .max(MAX_COOK_TIMERS)
      .refine((timers) => new Set(timers.map((timer) => timer.id)).size === timers.length, {
        message: 'Duplicate timer',
      }),
  })
  .strict();
export type CookState = z.infer<typeof cookStateSchema>;

export const cookSessionInputSchema = z.object({ state: cookStateSchema }).strict();

/** The active session of a user; `serverNow` lets the client correct its clock. */
export type CookSession = {
  version: number;
  updatedAt: string;
  state: CookState;
};

export type CookSessionResponse = { session: CookSession | null; serverNow: string };

/** Errors of the cooking API (`{ error }`), translated by the UI. */
export const COOK_ERRORS = ['invalid_timer'] as const;
