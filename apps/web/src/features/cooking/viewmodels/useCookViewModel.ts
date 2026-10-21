import {
  checkTranslationStructure,
  isLocale,
  MAX_COOK_ITEMS,
  type CookItem,
  type CookTimer,
  type Locale,
  type RecipeDetail,
} from '@cookit/shared';
import { useQueries, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText, parseDetail } from '@/features/recipes/model/display';
import { fetchRecipe, RECIPES_QUERY_KEY } from '@/features/recipes/model/recipes';
import { playAlarm, unlockAlarm } from '../model/alarm';
import { formatCountdown, remainingSeconds } from '../model/clock';
import {
  canAddRecipe,
  EMPTY_STATE,
  extendTimer,
  goToStep,
  removeRecipe,
  removeTimer,
  setLanguage,
  setServings,
  sortedTimers,
  startRecipe,
  startTimer,
  timerOf,
  toggleIngredient,
} from '../model/session';
import { cookIngredients, cookSteps } from '../model/steps';
import { activeRecipe, cookSyncFor } from '../model/store';
import { keepScreenOn } from '../model/wake-lock';

type CookError = 'structure_differs' | 'language_unavailable';

const NO_ITEMS: CookItem[] = [];

/** Only what the page needs from each recipe query: stable while those values do not change. */
const recipeResults = (results: UseQueryResult<RecipeDetail>[]) =>
  results.map((result) => ({ data: result.data, isError: result.isError }));

/**
 * The cooking mode (plan §5.3), `/cook`: the recipes of the session as cards (one shown at a
 * time, one step at a time), the ingredients to check, one timer bar for all recipes, computed
 * from end times with the server clock. Opened with `?recipe=…&servings=…&lang=…` from a recipe
 * to add it to the session. Every action is saved (local copy, then server).
 */
export function useCookViewModel() {
  const { user } = useSession();
  const userId = user?.id ?? '';
  const sync = cookSyncFor(userId);
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<CookError>();
  const [confirm, setConfirm] = useState<'end' | 'finish' | 'remove'>();

  // Load, and reload whenever the page comes back or the network returns.
  useEffect(() => {
    void sync.refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync.refresh();
    };
    const onOnline = () => void sync.flush();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [sync]);

  useEffect(() => keepScreenOn(), []);

  // The recipe shown on this device.
  const chosen = useSyncExternalStore(activeRecipe.subscribe, () => activeRecipe.get(userId));
  const select = (recipeId: string) => {
    setError(undefined);
    activeRecipe.set(userId, recipeId);
  };

  // Added from a recipe page, once the session is known.
  const start = useMemo(() => {
    const recipeId = searchParams.get('recipe');
    const lang = searchParams.get('lang');
    const servings = Number(searchParams.get('servings'));
    if (!recipeId || !isLocale(lang) || !Number.isInteger(servings) || servings < 1)
      return undefined;
    return { recipeId, lang, servings };
  }, [searchParams]);
  // A full session: the view says so until dismissed.
  const full =
    snapshot.ready &&
    start !== undefined &&
    !canAddRecipe(snapshot.state ?? EMPTY_STATE, start.recipeId);
  const clearStart = () => setSearchParams({}, { replace: true });
  useEffect(() => {
    if (!snapshot.ready || !start || full) return;
    sync.update((state) => startRecipe(state, start));
    activeRecipe.set(userId, start.recipeId);
    setSearchParams({}, { replace: true });
  }, [snapshot.ready, start, full, sync, setSearchParams, userId]);

  const items = snapshot.state?.items ?? NO_ITEMS;
  const item = items.find((entry) => entry.recipeId === chosen) ?? items[0];

  const results = useQueries({
    queries: items.map((entry) => ({
      queryKey: [...RECIPES_QUERY_KEY, 'detail', entry.recipeId, entry.lang],
      queryFn: () => fetchRecipe(entry.recipeId, entry.lang),
      retry: false,
    })),
    combine: recipeResults,
  });
  const { units, failed: unitsFailed } = useUnitCatalog();
  const unitsReady = units !== undefined || unitsFailed;
  const documents = useMemo(
    () =>
      results.map((result) =>
        result.data && unitsReady ? parseDetail(result.data, units) : undefined,
      ),
    [results, units, unitsReady],
  );
  /** Each recipe of the session as cooked: its scaled display and its steps. */
  const recipes = useMemo(
    () =>
      items.map((entry, i) => {
        const detail = results[i]?.data;
        const document_ = documents[i];
        const display =
          document_ && detail
            ? displayRecipe(document_, entry.servings, detail.lang, units)
            : undefined;
        const steps = display ? cookSteps(display) : [];
        const status =
          results[i]?.isError || (detail && unitsReady && !document_)
            ? ('recipe_missing' as const)
            : !display
              ? ('loading' as const)
              : steps.length === 0
                ? ('incomplete' as const)
                : ('ready' as const);
        return { item: entry, detail, document: document_, display, steps, status };
      }),
    [items, results, documents, units, unitsReady],
  );
  const current = recipes.find((recipe) => recipe.item === item);
  const detail = current?.detail;
  const document_ = current?.document;
  const display = current?.display;
  const steps = current?.steps ?? [];
  const ingredients = useMemo(() => (display ? cookIngredients(display) : []), [display]);
  const stepIndex = Math.min(item?.currentStep ?? 0, Math.max(0, steps.length - 1));
  const step = steps[stepIndex];

  // Server time, every second (countdowns).
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setDeviceNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const now = deviceNow + snapshot.offset;

  const colors = new Map(items.map((entry) => [entry.recipeId, entry.color]));
  const timers = (snapshot.state ? sortedTimers(snapshot.state) : []).map((timer) => {
    const remaining = remainingSeconds(timer.endsAt, now);
    return {
      ...timer,
      color: (timer.recipeId && colors.get(timer.recipeId)) || 'chart-1',
      remaining,
      finished: remaining <= 0,
      countdown: formatCountdown(remaining),
    };
  });

  // A timer that finishes while the page is open rings once.
  const rung = useRef(new Set<string>());
  const finishedIds = timers
    .filter((timer) => timer.finished)
    .map((timer) => timer.id)
    .join(',');
  useEffect(() => {
    let ring = false;
    for (const id of finishedIds ? finishedIds.split(',') : []) {
      if (!rung.current.has(id)) {
        rung.current.add(id);
        ring = true;
      }
    }
    if (ring && document.visibilityState === 'visible') playAlarm();
  }, [finishedIds]);

  const recipeId = item?.recipeId ?? '';
  const update = sync.update;

  /** Takes the shown recipe out of the session; the last one ends it. */
  const leaveRecipe = () => {
    setConfirm(undefined);
    setError(undefined);
    if (items.length <= 1) {
      rung.current.clear();
      sync.end();
      void navigate(recipeId ? `/recipes/${recipeId}` : '/recipes');
      return;
    }
    for (const timer of timers) if (timer.recipeId === recipeId) rung.current.delete(timer.id);
    update((state) => removeRecipe(state, recipeId));
    const next = items.find((entry) => entry.recipeId !== recipeId);
    if (next) select(next.recipeId);
  };

  return {
    status: !snapshot.ready
      ? ('loading' as const)
      : !item
        ? ('empty' as const)
        : ('cooking' as const),
    /** What can be shown of the current recipe. */
    recipeStatus: current?.status ?? ('loading' as const),
    offline: snapshot.offline,
    pending: snapshot.dirty,
    error: error ?? (full ? ('session_full' as const) : undefined),
    /** One card per recipe of the session, in the order they were added. */
    cards: recipes.map((recipe) => {
      const own = timers.filter((timer) => timer.recipeId === recipe.item.recipeId);
      return {
        recipeId: recipe.item.recipeId,
        title: recipe.display?.title ?? own[0]?.recipeTitle ?? '',
        status: recipe.status,
        color: recipe.item.color,
        active: recipe.item === item,
        stepNumber: Math.min(recipe.item.currentStep, Math.max(0, recipe.steps.length - 1)) + 1,
        stepCount: recipe.steps.length,
        timerCount: own.length,
        /** The timer of this recipe that ends first. */
        nextTimer: own[0],
      };
    }),
    canAdd: items.length < MAX_COOK_ITEMS,
    select,
    recipeId,
    title: display?.title ?? '',
    color: item?.color ?? 'chart-1',
    lang: item?.lang,
    languages: detail?.languages ?? [],
    servings: item?.servings ?? 1,
    baseServings: document_?.servings ?? 1,
    steps,
    step,
    stepIndex,
    stepCount: steps.length,
    ingredients: ingredients.map((group) => ({
      ...group,
      items: group.items.map((entry) =>
        entry.kind === 'ingredient'
          ? { ...entry, checked: item?.checkedIngredients.includes(entry.index) ?? false }
          : entry,
      ),
    })),
    checkedCount: item?.checkedIngredients.length ?? 0,
    timers,
    durationText,
    /** The running timer of a step's timer button, if any. */
    stepTimer: (stepNumber: number, slot: number) => {
      const timer = snapshot.state
        ? timerOf(snapshot.state, recipeId, stepNumber, slot)
        : undefined;
      return timer ? timers.find((t) => t.id === timer.id) : undefined;
    },

    previous: () => update((state) => goToStep(state, recipeId, stepIndex - 1, steps.length)),
    next: () => update((state) => goToStep(state, recipeId, stepIndex + 1, steps.length)),
    goTo: (index: number) => update((state) => goToStep(state, recipeId, index, steps.length)),
    toggleIngredient: (index: number) =>
      update((state) => toggleIngredient(state, recipeId, index)),
    setServings: (value: number) => update((state) => setServings(state, recipeId, value)),
    startStepTimer: (stepNumber: number, slot: number, seconds: number, label: string) => {
      unlockAlarm();
      const timer: Omit<CookTimer, 'endsAt'> = {
        id: crypto.randomUUID(),
        recipeId,
        recipeTitle: display?.title ?? '',
        label,
        durationSeconds: seconds,
        step: stepNumber,
        slot,
      };
      update((state) => startTimer(state, timer, Date.now() + snapshot.offset));
    },
    addMinute: (id: string) => {
      unlockAlarm();
      update((state) => extendTimer(state, id, 60, Date.now() + snapshot.offset));
    },
    removeTimer: (id: string) => {
      rung.current.delete(id);
      update((state) => removeTimer(state, id));
    },
    /**
     * Another language of the recipe, only when its structure is the same (plan §4): the current
     * step and the checked ingredients must keep their meaning.
     */
    chooseLanguage: async (lang: Locale) => {
      setError(undefined);
      if (!document_ || lang === item?.lang) return;
      try {
        const other = await queryClient.fetchQuery({
          queryKey: [...RECIPES_QUERY_KEY, 'detail', recipeId, lang],
          queryFn: () => fetchRecipe(recipeId, lang),
        });
        const otherDocument = parseDetail(other, units);
        if (!otherDocument || other.lang !== lang) throw new Error('missing');
        if (checkTranslationStructure(document_, otherDocument).length > 0) {
          setError('structure_differs');
          return;
        }
        update((state) => setLanguage(state, recipeId, lang));
      } catch {
        setError('language_unavailable');
      }
    },
    dismissError: () => {
      setError(undefined);
      if (full) clearStart();
    },

    /** Several recipes: "Finish" takes this one out; alone, it ends the session. */
    alone: items.length <= 1,
    confirm,
    askEnd: () => setConfirm('end'),
    askFinish: () => setConfirm('finish'),
    askRemove: () => setConfirm('remove'),
    cancelConfirm: () => setConfirm(undefined),
    leaveRecipe,
    endSession: () => {
      setConfirm(undefined);
      rung.current.clear();
      sync.end();
      void navigate(recipeId ? `/recipes/${recipeId}` : '/recipes');
    },
  };
}
