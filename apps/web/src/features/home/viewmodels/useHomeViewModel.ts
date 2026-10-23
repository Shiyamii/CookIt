import { isLocale } from '@cookit/shared';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { cookSyncFor } from '@/features/cooking/model/store';
import { fetchMyRecipes, fetchRecipe, RECIPES_QUERY_KEY } from '@/features/recipes/model/recipes';
import { remainingCount } from '@/features/shopping/model/list';
import { useShoppingSync } from '@/features/shopping/viewmodels/useShoppingSync';
import { fetchMeta, META_QUERY_KEY, type ApiStatus } from '@/features/system/model/meta';
import { cookingSummary, fetchIdea, localDay } from '../model/home';

const RECENT_COUNT = 4;
const noSubscription = () => () => undefined;

/**
 * Home page. Signed out: a welcome and the server status. Signed in: the cooking in progress (to
 * resume it), the idea of the day (another one on demand) and the recipes changed last.
 */
export function useHomeViewModel() {
  const { user, isLoading } = useSession();
  const { i18n } = useTranslation();
  const meta = useQuery({ queryKey: META_QUERY_KEY, queryFn: fetchMeta });
  const apiStatus: ApiStatus = meta.isPending ? 'loading' : meta.isError ? 'error' : 'ok';

  // The clock moves on (next timer, the day of the idea) without re-rendering every second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // The cooking session, as the cooking mode keeps it (local copy, then the server's).
  const sync = user ? cookSyncFor(user.id) : undefined;
  const snapshot = useSyncExternalStore(sync?.subscribe ?? noSubscription, () =>
    sync?.getSnapshot(),
  );
  useEffect(() => {
    void sync?.refresh();
  }, [sync]);
  const offset = snapshot?.offset ?? 0;
  const cooking = cookingSummary(snapshot?.state ?? null, now + offset);
  const titles = useQueries({
    queries: (cooking?.items ?? []).map((item) => ({
      queryKey: [...RECIPES_QUERY_KEY, 'detail', item.recipeId, item.lang],
      queryFn: () => fetchRecipe(item.recipeId, item.lang),
      retry: false,
    })),
  });
  const time = new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'short' });
  // Recipes in the interface language when they have that translation.
  const lang = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : undefined;

  // The shopping list: a reminder of what is left to buy.
  const shopping = useShoppingSync();
  const toBuy = remainingCount(shopping.snapshot?.state ?? null);

  const recent = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'home', 'recent', lang],
    queryFn: () => fetchMyRecipes('', 1, [], lang),
    enabled: user !== null,
  });

  // Another idea: the next try, never the one shown.
  const day = localDay(new Date(now));
  const [another, setAnother] = useState({ n: 0, exclude: undefined as string | undefined });
  const idea = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'idea', day, another.n, another.exclude, lang],
    queryFn: () => fetchIdea(day, another.n, another.exclude, lang),
    enabled: user !== null,
    placeholderData: keepPreviousData,
  });

  return {
    status: isLoading ? 'loading' : user ? 'signed_in' : 'signed_out',
    apiStatus,
    name: user?.name ?? '',
    cooking: cooking && {
      recipes: cooking.items.map((item, index) => ({
        id: item.recipeId,
        color: item.color,
        step: item.step,
        title: titles[index]?.data?.title,
      })),
      next: cooking.next && {
        label: cooking.next.label,
        recipeTitle: cooking.next.recipeTitle,
        // Shown on the device's clock.
        time: time.format(cooking.next.endsAt - offset),
      },
      finished: cooking.finished,
    },
    idea: idea.data?.recipe,
    ideaLoading: idea.isPending,
    ideaChanging: idea.isPlaceholderData,
    anotherIdea: () =>
      setAnother((current) => ({ n: current.n + 1, exclude: idea.data?.recipe?.id })),
    toBuy,
    recent: recent.data?.recipes.slice(0, RECENT_COUNT) ?? [],
    recentLoading: recent.isPending,
  };
}
