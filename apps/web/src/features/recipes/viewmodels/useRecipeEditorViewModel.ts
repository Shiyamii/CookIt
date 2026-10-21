import { isLocale, parseRecipe, type Diagnostic, type Locale } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate, useParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { displayRecipe, durationText } from '../model/display';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useTagCatalog, useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import {
  clearDraft,
  clearOtherUsersDrafts,
  draftKey as draftKeyOf,
  loadDraft,
  saveDraft,
  type Draft,
} from '../model/draft';
import {
  emptyRecipe,
  fromDetail,
  fromMarkdown,
  ingredientParts,
  joinIngredient,
  toBody,
  toFields,
  toMarkdown,
  unitSuggestions,
  type IngredientParts,
  type InvalidField,
} from '../model/editor';
import {
  editorReducer,
  insertTimer,
  markQuantity,
  stepChips,
  timerSeconds,
  unlinkSegment,
  updateTimer,
  type EditorAction,
} from '../model/editor-actions';
import {
  createRecipe,
  createRecipeFromMarkdown,
  fetchRecipe,
  InvalidRecipeError,
  RECIPES_QUERY_KEY,
  saveRecipe,
  saveRecipeMarkdown,
} from '../model/recipes';

export type EditorMode = 'visual' | 'markdown' | 'preview';

const DRAFT_DELAY_MS = 800;

/**
 * The recipe editor (`/recipes/new`, `/recipes/:id/edit`): a visual editor and a markdown editor
 * on the same text, switchable without loss (markdown → visual is refused while the text has
 * errors), a preview, a local draft, and a guard against leaving with unsaved changes.
 */
export function useRecipeEditorViewModel() {
  const { id } = useParams();
  const isNew = id === undefined;
  const { user } = useSession();
  // The editor is behind RequireAccess: the user is known.
  const userId = user?.id ?? '';
  const draftKey = draftKeyOf(userId, id);
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'detail', id],
    queryFn: () => fetchRecipe(id ?? ''),
    enabled: !isNew,
    retry: false,
  });
  const detail = existing.data;

  const [recipe, dispatch] = useReducer(editorReducer, undefined, emptyRecipe);
  const [mode, setMode] = useState<EditorMode>('visual');
  // The markdown editor's text (its source of truth while it is open).
  const [markdown, setMarkdown] = useState('');
  const [lang, setLang] = useState<Locale>(
    isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr',
  );
  const [baseVersion, setBaseVersion] = useState<string>();
  // What was last loaded or saved: "unsaved changes" compare against it.
  const [savedMarkdown, setSavedMarkdown] = useState<string>();
  // Tags are chosen with pickers, never in the markdown (plan §4); saved by both editors.
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [savedTagIds, setSavedTagIds] = useState<string[]>([]);
  const { units, failed: unitsFailed } = useUnitCatalog();
  const catalog = useTagCatalog();
  const [draft, setDraft] = useState<Draft>();
  const [switchError, setSwitchError] = useState<Diagnostic[]>();
  const [invalid, setInvalid] = useState<InvalidField[]>([]);
  const [serverDiagnostics, setServerDiagnostics] = useState<Diagnostic[]>();
  const [error, setError] = useState<string>();
  const leaving = useRef(false);

  // Once loaded (and again after reloading the stored recipe): start from the stored recipe, or
  // an empty one, and offer a draft left from last time. Done while rendering, keyed on the
  // loaded version (React's pattern for state derived from props).
  // The unit catalog is needed to read the recipe (the built-in one if it failed).
  const loaded = (isNew || detail !== undefined) && (units !== undefined || unitsFailed);
  const loadedVersion = isNew ? 'new' : detail?.updatedAt;
  const [startedFrom, setStartedFrom] = useState<string>();
  if (loaded && startedFrom !== loadedVersion) {
    setStartedFrom(loadedVersion);
    const start = detail ? fromDetail(detail, units) : emptyRecipe();
    setTagIds(detail?.tagIds ?? []);
    setSavedTagIds(detail?.tagIds ?? []);
    const startLang = detail?.lang ?? lang;
    dispatch({ type: 'replace', recipe: start });
    setLang(startLang);
    setBaseVersion(detail?.updatedAt);
    const initial = toMarkdown(start, startLang);
    setSavedMarkdown(initial);
    const stored = loadDraft(draftKey);
    setDraft(
      stored && stored.markdown !== initial && stored.baseVersion === detail?.updatedAt
        ? stored
        : undefined,
    );
  }

  useEffect(() => clearOtherUsersDrafts(userId), [userId]);

  const current = mode === 'markdown' ? markdown : toMarkdown(recipe, lang);
  const tagsChanged =
    tagIds.length !== savedTagIds.length || tagIds.some((tagId) => !savedTagIds.includes(tagId));
  const dirty = savedMarkdown !== undefined && (current !== savedMarkdown || tagsChanged);

  // Live diagnostics of the markdown editor.
  const markdownCheck = useMemo(
    () => (mode === 'markdown' ? fromMarkdown(markdown, units) : undefined),
    [mode, markdown, units],
  );

  // The draft follows the edits (after a short pause).
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      saveDraft(draftKey, {
        markdown: current,
        baseVersion,
        tagIds,
        savedAt: new Date().toISOString(),
      });
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, current, draftKey, baseVersion, tagIds]);

  // Leaving the page (or the site) with unsaved changes asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname;
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Goes to `target`, or stays with the reason when the markdown text has errors. */
  const switchTo = (target: EditorMode) => {
    setSwitchError(undefined);
    if (target === mode) return;
    if (mode === 'markdown') {
      const parsed = fromMarkdown(markdown, units);
      if (!parsed.ok) {
        setSwitchError(parsed.diagnostics);
        return;
      }
      dispatch({ type: 'replace', recipe: parsed.recipe });
    }
    if (target === 'markdown') setMarkdown(toMarkdown(recipe, lang));
    setMode(target);
  };

  const done = async (recipeId: string) => {
    clearDraft(draftKey);
    leaving.current = true;
    await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    await navigate(`/recipes/${recipeId}`, { replace: isNew });
  };

  const save = useMutation({
    mutationFn: async (): Promise<string> => {
      if (mode === 'markdown') {
        if (isNew) return (await createRecipeFromMarkdown(markdown, lang, tagIds)).id;
        await saveRecipeMarkdown(id, markdown, baseVersion ?? '', tagIds);
        return id;
      }
      const fields = toFields(recipe);
      if (!fields.ok) throw new Error('invalid_fields');
      const body = toBody(recipe, lang);
      if (isNew) return (await createRecipe({ ...fields.fields, body, lang, tagIds })).id;
      await saveRecipe(id, { ...fields.fields, body, baseVersion, tagIds });
      return id;
    },
    onMutate: () => {
      setError(undefined);
      setServerDiagnostics(undefined);
    },
    onSuccess: (recipeId) => done(recipeId),
    onError: (failure) => {
      if (failure instanceof InvalidRecipeError) setServerDiagnostics(failure.diagnostics);
      else setError(errorCode(failure));
    },
  });

  // The preview shows the recipe as its page will (undefined while it cannot be read).
  const preview = useMemo(() => {
    if (mode !== 'preview') return undefined;
    const result = parseRecipe(toMarkdown(recipe, lang), { units });
    return result.ok
      ? displayRecipe(result.document, result.document.servings, lang, units)
      : undefined;
  }, [mode, recipe, lang, units]);

  const suggestions = useMemo(() => unitSuggestions(lang, units), [lang, units]);

  // Tag pickers: one per category, single or multiple choice.
  const tagPickers = catalog.categories
    .filter((category) => category.tags.length > 0)
    .map((category) => ({
      id: category.id,
      label: catalog.label(category.labels, category.slug),
      multiple: category.multiple,
      tags: category.tags.map((tag) => ({
        id: tag.id,
        label: catalog.label(tag.labels, tag.slug),
        selected: tagIds.includes(tag.id),
      })),
    }));

  return {
    status: !isNew && existing.isError ? 'not_found' : loaded ? 'ready' : 'loading',
    isNew,
    recipe,
    dispatch: (action: EditorAction) => dispatch(action),
    mode,
    switchTo,
    switchError,
    markdown,
    setMarkdown,
    markdownDiagnostics: markdownCheck?.diagnostics ?? [],
    lang,
    setLang,
    preview,
    invalid,
    dirty,
    saving: save.isPending,
    error,
    serverDiagnostics,
    save: () => {
      if (mode !== 'markdown') {
        const fields = toFields(recipe);
        setInvalid(fields.ok ? [] : fields.invalid);
        if (!fields.ok) return;
      }
      if (mode === 'markdown' && markdownCheck && !markdownCheck.ok) {
        setServerDiagnostics(markdownCheck.diagnostics);
        return;
      }
      save.mutate();
    },
    cancel: () => void navigate(isNew ? '/recipes' : `/recipes/${id}`),
    // Draft left from a previous visit.
    draftSavedAt: draft?.savedAt,
    restoreDraft: () => {
      if (!draft) return;
      if (draft.tagIds) setTagIds(draft.tagIds);
      const parsed = fromMarkdown(draft.markdown, units);
      if (parsed.ok) {
        dispatch({ type: 'replace', recipe: parsed.recipe });
        setMode('visual');
      } else {
        setMarkdown(draft.markdown);
        setMode('markdown');
      }
      setDraft(undefined);
    },
    discardDraft: () => {
      clearDraft(draftKey);
      setDraft(undefined);
    },
    // The stored recipe changed meanwhile (conflict): reload it, dropping these edits.
    reloadFromServer: async () => {
      clearDraft(draftKey);
      setError(undefined);
      setMode('visual');
      // A new version restarts the editor from it (see `startedFrom`).
      setStartedFrom(undefined);
      await existing.refetch();
    },
    blocked: blocker.state === 'blocked',
    stay: () => blocker.reset?.(),
    leave: () => blocker.proceed?.(),
    // Helpers for the rows of the visual editor.
    ingredientParts: (raw: string) => ingredientParts(raw, units),
    tagPickers,
    /** Single-choice categories keep one tag (choosing it again removes it). */
    toggleTag: (categoryId: string, tagId: string) => {
      const category = catalog.categories.find((c) => c.id === categoryId);
      if (!category) return;
      setTagIds((current) => {
        if (current.includes(tagId)) return current.filter((id) => id !== tagId);
        const others = category.multiple
          ? current
          : current.filter((id) => !category.tags.some((tag) => tag.id === id));
        return [...others, tagId];
      });
    },
    unitSuggestions: suggestions,
    joinIngredient: (parts: IngredientParts) => joinIngredient(parts),
    stepChips,
    durationText,
    timerSeconds,
    insertTimer,
    markQuantity,
    updateTimer,
    unlinkSegment,
  };
}
