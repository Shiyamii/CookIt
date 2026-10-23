import type { Locale, RecipeVisibility } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { useLinkToken } from '@/features/auth/viewmodels/useLinkToken';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useTagCatalog, useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { composeRecipeMarkdown } from '@cookit/shared';
import { displayRecipe, durationText, parseDetail, sourceLink } from '../model/display';
import { downloadText, markdownFileName } from '../model/importing';
import {
  copyRecipe,
  deleteRecipe,
  fetchRecipe,
  fetchSharedRecipe,
  RECIPES_QUERY_KEY,
  setVisibility,
} from '../model/recipes';
import { missingLanguages, readingLanguage } from '../model/translation';

/**
 * A recipe page: `/recipes/:id` (owner or public recipe) or `/shared#token=…` (unlisted share
 * link). Servings can be changed (quantities follow, timers don't); the owner manages visibility
 * and deletion; another signed-in user can add it to their library. Shown in the language
 * chosen (`?lang=` when the page opens), else the interface's, else the base language.
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
  const { i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  // Kept in state, not in the URL: the share link carries its token in the fragment.
  const [chosenLang, setChosenLang] = useState(() => searchParams.get('lang'));
  const lang = readingLanguage(chosenLang, i18n.resolvedLanguage);

  const recipe = useQuery({
    queryKey:
      source === 'id'
        ? [...RECIPES_QUERY_KEY, 'detail', id, lang]
        : [...RECIPES_QUERY_KEY, 'shared', token, lang],
    queryFn: () => (source === 'id' ? fetchRecipe(id, lang) : fetchSharedRecipe(token, lang)),
    // The same recipe in another language: keep showing it while the translation loads.
    placeholderData: (previous) =>
      source === 'shared' || previous?.id === id ? previous : undefined,
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
    /** The parsed recipe (its ingredients go to the shopping list). */
    document,
    tagGroups,
    lang: detail?.lang,
    baseLang: detail?.baseLang,
    /** Languages the recipe exists in (a choice is only offered when there are several). */
    languages: detail?.languages ?? [],
    chooseLanguage: (value: Locale) => setChosenLang(value),
    /** Owner: languages to add a translation in. */
    missingLanguages: detail?.isOwner ? missingLanguages(detail.languages) : [],
    /** Shown in a translation (not the base language): edited through the translation screen. */
    isTranslation: detail !== undefined && detail.lang !== detail.baseLang,
    ownerName: detail?.ownerName ?? '',
    /** What the notes block needs. */
    notes: detail
      ? {
          recipeId: detail.id,
          token: source === 'shared' ? token : undefined,
          authorNote: detail.authorNote,
          myNote: detail.myNote,
          isOwner: detail.isOwner,
          signedIn: user !== null,
        }
      : undefined,
    ownerImage: detail?.ownerImage ?? null,
    /** Photos, the cover first. */
    images: detail?.images ?? [],
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
    incomplete: detail?.incomplete ?? false,
    /**
     * Cooking reads the recipe from its id: the owner's or a public one (an unlisted recipe of
     * someone else is cooked from the reader's library).
     */
    canCook:
      user !== null && detail !== undefined && (detail.isOwner || detail.visibility === 'public'),
    cookHref: detail
      ? `/cook?${new URLSearchParams({
          recipe: detail.id,
          servings: String(servings ?? document?.servings ?? detail.servings),
          lang: detail.lang,
        }).toString()}`
      : '',
    /** The recipe as a `.md` file, with its tags (neutral slugs) and the format version. */
    exportMarkdown: () => {
      if (!detail) return;
      const slugs = new Map(
        catalog.categories.flatMap((category) => category.tags.map((tag) => [tag.id, tag.slug])),
      );
      const markdown = composeRecipeMarkdown(
        {
          title: detail.title,
          description: detail.description,
          servings: detail.servings,
          source: detail.source ?? undefined,
          extraMeta: detail.extraMeta,
          tags: detail.tagIds.flatMap((id) => slugs.get(id) ?? []),
        },
        detail.body,
        { locale: detail.lang, includeTags: true },
      );
      downloadText(markdownFileName(detail.title), markdown);
    },
  };
}
