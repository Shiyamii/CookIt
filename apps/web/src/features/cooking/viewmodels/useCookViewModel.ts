import { checkTranslationStructure, isLocale, type CookTimer, type Locale } from '@cookit/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText, parseDetail } from '@/features/recipes/model/display';
import { fetchRecipe, RECIPES_QUERY_KEY } from '@/features/recipes/model/recipes';
import { playAlarm, unlockAlarm } from '../model/alarm';
import { formatCountdown, remainingSeconds } from '../model/clock';
import {
  extendTimer,
  goToStep,
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
import { cookSyncFor } from '../model/store';
import { keepScreenOn } from '../model/wake-lock';

/**
 * The cooking mode (plan §5.3), `/cook`: one step at a time, the ingredients to check, timers
 * computed from their end time with the server clock. Opened with `?recipe=…&servings=…&lang=…`
 * from a recipe to start cooking it. Every action is saved (local copy, then server).
 */
export function useCookViewModel() {
  const { user } = useSession();
  const sync = cookSyncFor(user?.id ?? '');
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState<'structure_differs' | 'language_unavailable'>();
  const [confirmEnd, setConfirmEnd] = useState(false);

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

  // Started from a recipe page: once the session is known.
  const start = useMemo(() => {
    const recipeId = searchParams.get('recipe');
    const lang = searchParams.get('lang');
    const servings = Number(searchParams.get('servings'));
    if (!recipeId || !isLocale(lang) || !Number.isInteger(servings) || servings < 1)
      return undefined;
    return { recipeId, lang, servings };
  }, [searchParams]);
  const otherRecipe =
    start && snapshot.state?.items.some((item) => item.recipeId !== start.recipeId);
  const clearStart = () => setSearchParams({}, { replace: true });
  const applyStart = () => {
    if (!start) return;
    sync.update((state) => startRecipe(state, start));
    clearStart();
  };
  useEffect(() => {
    // Another recipe in progress: the view asks first.
    if (snapshot.ready && start && !otherRecipe) {
      sync.update((state) => startRecipe(state, start));
      setSearchParams({}, { replace: true });
    }
  }, [snapshot.ready, start, otherRecipe, sync, setSearchParams]);

  const item = snapshot.state?.items[0];
  const recipe = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'detail', item?.recipeId, item?.lang],
    queryFn: () => fetchRecipe(item?.recipeId ?? '', item?.lang),
    enabled: item !== undefined,
    retry: false,
    placeholderData: (previous) => (previous?.id === item?.recipeId ? previous : undefined),
  });
  const detail = recipe.data;
  const { units, failed: unitsFailed } = useUnitCatalog();
  const unitsReady = units !== undefined || unitsFailed;
  const document_ = useMemo(
    () => (detail && unitsReady ? parseDetail(detail, units) : undefined),
    [detail, units, unitsReady],
  );
  const display = useMemo(
    () =>
      document_ && detail && item
        ? displayRecipe(document_, item.servings, detail.lang, units)
        : undefined,
    [document_, detail, item, units],
  );
  const steps = useMemo(() => (display ? cookSteps(display) : []), [display]);
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

  const timers = (snapshot.state ? sortedTimers(snapshot.state) : []).map((timer) => {
    const remaining = remainingSeconds(timer.endsAt, now);
    return { ...timer, remaining, finished: remaining <= 0, countdown: formatCountdown(remaining) };
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

  return {
    status: !snapshot.ready
      ? 'loading'
      : start && otherRecipe
        ? 'confirm_replace'
        : !item
          ? 'empty'
          : recipe.isError || (detail && unitsReady && !document_)
            ? 'recipe_missing'
            : !display
              ? 'loading'
              : steps.length === 0
                ? 'incomplete'
                : 'ready',
    offline: snapshot.offline,
    pending: snapshot.dirty,
    error,
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

    replaceSession: applyStart,
    keepSession: clearStart,
    confirmEnd,
    askEnd: () => setConfirmEnd(true),
    cancelEnd: () => setConfirmEnd(false),
    endSession: () => {
      setConfirmEnd(false);
      rung.current.clear();
      sync.end();
      void navigate(recipeId ? `/recipes/${recipeId}` : '/recipes');
    },
  };
}
