import {
  cookText,
  COOK_COLORS,
  MAX_COOK_ITEMS,
  MAX_COOK_TIMERS,
  MAX_TIMER_SECONDS,
  type CookItem,
  type CookState,
  type CookTimer,
  type Locale,
} from '@cookit/shared';

/**
 * The cooking session as pure updates of its state (plan §5.3). Each user action is one event:
 * the view model applies it, keeps a local copy and sends the new state to the server.
 */

export const EMPTY_STATE: CookState = { items: [], timers: [] };

const updateItem = (
  state: CookState,
  recipeId: string,
  update: (item: CookItem) => CookItem,
): CookState => ({
  ...state,
  items: state.items.map((item) => (item.recipeId === recipeId ? update(item) : item)),
});

/** Another recipe can join the session (one color per recipe). */
export function canAddRecipe(state: CookState, recipeId: string): boolean {
  return (
    state.items.some((item) => item.recipeId === recipeId) || state.items.length < MAX_COOK_ITEMS
  );
}

/**
 * Cooks a recipe along with the others of the session (plan §5.3). The same recipe keeps its
 * progress (new servings or language if given); another one is added with the first free color.
 * A full session is left as it is (`canAddRecipe`).
 */
export function startRecipe(
  state: CookState,
  start: { recipeId: string; lang: Locale; servings: number },
): CookState {
  if (state.items.some((item) => item.recipeId === start.recipeId)) {
    return updateItem(state, start.recipeId, (item) => ({
      ...item,
      lang: start.lang,
      servings: start.servings,
    }));
  }
  if (!canAddRecipe(state, start.recipeId)) return state;
  const used = new Set(state.items.map((item) => item.color));
  const item: CookItem = {
    ...start,
    currentStep: 0,
    checkedIngredients: [],
    color: COOK_COLORS.find((color) => !used.has(color)) ?? COOK_COLORS[0],
  };
  return { ...state, items: [...state.items, item] };
}

/** Takes a recipe out of the session, with its timers. */
export function removeRecipe(state: CookState, recipeId: string): CookState {
  return {
    items: state.items.filter((item) => item.recipeId !== recipeId),
    timers: state.timers.filter((timer) => timer.recipeId !== recipeId),
  };
}

/** Goes to a step, within the recipe's `stepCount` steps. */
export function goToStep(
  state: CookState,
  recipeId: string,
  step: number,
  stepCount: number,
): CookState {
  const currentStep = Math.max(0, Math.min(step, stepCount - 1));
  return updateItem(state, recipeId, (item) => ({ ...item, currentStep }));
}

export function toggleIngredient(state: CookState, recipeId: string, index: number): CookState {
  return updateItem(state, recipeId, (item) => ({
    ...item,
    checkedIngredients: item.checkedIngredients.includes(index)
      ? item.checkedIngredients.filter((i) => i !== index)
      : [...item.checkedIngredients, index].sort((a, b) => a - b),
  }));
}

export function setServings(state: CookState, recipeId: string, servings: number): CookState {
  const value = Math.max(1, Math.min(1000, Math.round(servings)));
  return updateItem(state, recipeId, (item) => ({ ...item, servings: value }));
}

/** Another language of the recipe (only when its structure is the same: checked by the caller). */
export function setLanguage(state: CookState, recipeId: string, lang: Locale): CookState {
  return updateItem(state, recipeId, (item) => ({ ...item, lang }));
}

/** The running timer started from that step's timer, if any. */
export function timerOf(
  state: CookState,
  recipeId: string,
  step: number,
  slot: number,
): CookTimer | undefined {
  return state.timers.find(
    (timer) => timer.recipeId === recipeId && timer.step === step && timer.slot === slot,
  );
}

/**
 * Starts a timer ending `durationSeconds` after `now` (server time). A step's timer that is
 * already running is not started twice.
 */
export function startTimer(
  state: CookState,
  timer: Omit<CookTimer, 'endsAt'>,
  now: number,
): CookState {
  if (timer.step !== null && timer.slot !== null && timer.recipeId !== null) {
    if (timerOf(state, timer.recipeId, timer.step, timer.slot)) return state;
  }
  if (state.timers.length >= MAX_COOK_TIMERS) return state;
  const durationSeconds = Math.max(
    1,
    Math.min(MAX_TIMER_SECONDS, Math.round(timer.durationSeconds)),
  );
  const endsAt = new Date(now + durationSeconds * 1000).toISOString();
  const texts = { label: cookText(timer.label), recipeTitle: cookText(timer.recipeTitle) };
  return {
    ...state,
    timers: [...state.timers, { ...timer, ...texts, durationSeconds, endsAt }],
  };
}

/** `+1 min`: from the end time, or from now for a finished timer (it runs again). */
export function extendTimer(state: CookState, id: string, seconds: number, now: number): CookState {
  return {
    ...state,
    timers: state.timers.map((timer) => {
      if (timer.id !== id) return timer;
      const end = Math.max(Date.parse(timer.endsAt), now) + seconds * 1000;
      const longest = now + MAX_TIMER_SECONDS * 1000;
      return { ...timer, endsAt: new Date(Math.min(end, longest)).toISOString() };
    }),
  };
}

/** Cancels a running timer, or dismisses a finished one. */
export function removeTimer(state: CookState, id: string): CookState {
  return { ...state, timers: state.timers.filter((timer) => timer.id !== id) };
}

/** Timers in the order they end. */
export function sortedTimers(state: CookState): CookTimer[] {
  return [...state.timers].sort((a, b) => Date.parse(a.endsAt) - Date.parse(b.endsAt));
}
