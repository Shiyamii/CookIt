import {
  cookText,
  COOK_COLORS,
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

/**
 * Cooking one recipe (phase 6: one recipe per session). The same recipe keeps its progress (new
 * servings or language if given); another recipe replaces the session, timers included.
 */
export function startRecipe(
  state: CookState,
  start: { recipeId: string; lang: Locale; servings: number },
): CookState {
  const current = state.items.find((item) => item.recipeId === start.recipeId);
  if (current) {
    return {
      ...state,
      items: [{ ...current, lang: start.lang, servings: start.servings }],
      timers: state.timers.filter((timer) => timer.recipeId === start.recipeId),
    };
  }
  const item: CookItem = {
    ...start,
    currentStep: 0,
    checkedIngredients: [],
    color: COOK_COLORS[0],
  };
  return { items: [item], timers: [] };
}

const updateItem = (
  state: CookState,
  recipeId: string,
  update: (item: CookItem) => CookItem,
): CookState => ({
  ...state,
  items: state.items.map((item) => (item.recipeId === recipeId ? update(item) : item)),
});

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
