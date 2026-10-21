import type { RecipeVisibility } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { useLinkToken } from '@/features/auth/viewmodels/useLinkToken';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useTagCatalog, useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText, parseDetail, sourceLink } from '../model/display';
import {
  copyRecipe,
  deleteRecipe,
  fetchRecipe,
  fetchSharedRecipe,
  RECIPES_QUERY_KEY,
  setVisibility,
} from '../model/recipes';

/**
 * A recipe page: `/recipes/:id` (owner or public recipe) or `/shared#token=…` (unlisted share
 * link). Servings can be changed (quantities follow, timers don't); the owner manages visibility
 * and deletion; another signed-in user can add it to their library.
 */
export function useRecipeViewModel(source: 'id' | 'shared') {
  const { id = '' } = useParams();
  const token = useLinkToken({ keep: true });
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [servings, setServings] = useState<number>();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string>();

  const recipe = useQuery({
    queryKey:
      source === 'id'
        ? [...RECIPES_QUERY_KEY, 'detail', id]
        : [...RECIPES_QUERY_KEY, 'shared', token],
    queryFn: () => (source === 'id' ? fetchRecipe(id) : fetchSharedRecipe(token)),
    enabled: source === 'id' ? id !== '' : token !== '',
    retry: false,
  });
  const detail = recipe.data;

  // Read and scaled with the unit catalog of the database (the built-in one if it failed).
  const { units, failed: unitsFailed } = useUnitCatalog();
  const unitsReady = units !== undefined || unitsFailed;
  const document = useMemo(
    () => (detail && unitsReady ? parseDetail(detail, units) : undefined),
    [detail, units, unitsReady],
  );
  const shownServings = servings ?? document?.servings ?? 1;
  const display = useMemo(
    () =>
      document && detail ? displayRecipe(document, shownServings, detail.lang, units) : undefined,
    [document, detail, shownServings, units],
  );

  // Tags of the recipe, by category, in the interface language.
  const catalog = useTagCatalog();
  const tagGroups = useMemo(() => {
    const ids = new Set(detail?.tagIds ?? []);
    return catalog.categories
      .map((category) => ({
        category: catalog.label(category.labels, category.slug),
        tags: category.tags
          .filter((tag) => ids.has(tag.id))
          .map((tag) => ({
            id: tag.id,
            slug: tag.slug,
            label: catalog.label(tag.labels, tag.slug),
          })),
      }))
      .filter((group) => group.tags.length > 0);
  }, [catalog, detail?.tagIds]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });

  const visibility = useMutation({
    mutationFn: (value: RecipeVisibility) => setVisibility(detail?.id ?? '', value),
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      setCopied(false);
      await refresh();
    },
    onError: (failure) => setError(errorCode(failure)),
  });

  const removal = useMutation({
    mutationFn: () => deleteRecipe(detail?.id ?? ''),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: [...RECIPES_QUERY_KEY, 'detail', detail?.id] });
      await refresh();
      await navigate('/recipes', { replace: true });
    },
    onError: (failure) => {
      setConfirmDelete(false);
      setError(errorCode(failure));
    },
  });

  const copy = useMutation({
    mutationFn: () => copyRecipe(detail?.id ?? '', source === 'shared' ? token : undefined),
    onMutate: () => setError(undefined),
    onSuccess: async (created) => {
      await refresh();
      await navigate(`/recipes/${created.id}`);
    },
    onError: (failure) => setError(errorCode(failure)),
  });

  const missing =
    (source === 'shared' && token === '') || recipe.isError || (detail && unitsReady && !document);

  return {
    status: missing ? 'not_found' : recipe.isPending || !unitsReady ? 'loading' : 'ready',
    recipe: display,
    tagGroups,
    lang: detail?.lang,
    ownerName: detail?.ownerName ?? '',
    isOwner: detail?.isOwner ?? false,
    canCopy: user !== null && detail !== undefined && !detail.isOwner,
    signedIn: user !== null,
    id: detail?.id ?? '',
    visibility: detail?.visibility ?? 'private',
    shareUrl: detail?.shareUrl ?? null,
    sourceHref: sourceLink(display?.source ?? null),
    durationText,
    baseServings: document?.servings ?? 1,
    servings: shownServings,
    setServings: (value: number) => setServings(Math.max(1, Math.min(1000, Math.round(value)))),
    resetServings: () => setServings(undefined),
    error,
    busy: visibility.isPending || removal.isPending || copy.isPending,
    changeVisibility: (value: RecipeVisibility) => visibility.mutate(value),
    copied,
    copyShareUrl: async () => {
      if (!detail?.shareUrl) return;
      try {
        await navigator.clipboard.writeText(detail.shareUrl);
        setCopied(true);
      } catch {
        // No clipboard access: the link stays selectable.
      }
    },
    confirmDelete,
    askDelete: () => setConfirmDelete(true),
    cancelDelete: () => setConfirmDelete(false),
    deleteRecipe: () => removal.mutate(),
    addToLibrary: () => copy.mutate(),
  };
}
