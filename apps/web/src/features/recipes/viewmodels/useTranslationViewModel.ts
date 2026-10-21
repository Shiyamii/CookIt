import { isLocale, translationPrompt, type Diagnostic, type Locale } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { errorCode } from '@/lib/api';
import { useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText, parseDetail } from '../model/display';
import { detailMarkdown } from '../model/editor';
import {
  deleteTranslation,
  fetchRecipe,
  InvalidRecipeError,
  RECIPES_QUERY_KEY,
  saveTranslation,
} from '../model/recipes';
import { translationPreview } from '../model/translation';

/**
 * "Add a translation" (plan §5.6), `/recipes/:id/translate/:lang`: a prompt to copy (the recipe
 * in its base language and the target language), then the AI's answer pasted, previewed with its
 * errors and the structure warnings. An existing translation is loaded in the text area, so it
 * can also be corrected by hand.
 */
export function useTranslationViewModel() {
  const { id = '', lang: langParam } = useParams();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const lang: Locale | undefined = isLocale(langParam) ? langParam : undefined;
  const [answer, setAnswer] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [savedWarnings, setSavedWarnings] = useState<Diagnostic[]>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The base language (no `lang`), and the translation itself when it exists.
  const base = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'detail', id],
    queryFn: () => fetchRecipe(id),
    enabled: id !== '',
    retry: false,
  });
  const detail = base.data;
  const exists = lang !== undefined && (detail?.languages.includes(lang) ?? false);
  const current = useQuery({
    queryKey: [...RECIPES_QUERY_KEY, 'detail', id, lang],
    queryFn: () => fetchRecipe(id, lang),
    enabled: exists,
    retry: false,
  });

  // An existing translation starts in the text area, until the user types.
  const existing = exists && current.data?.lang === lang ? current.data : undefined;

  const { units, failed: unitsFailed } = useUnitCatalog();
  const unitsReady = units !== undefined || unitsFailed;
  const baseDocument = useMemo(
    () => (detail && unitsReady ? parseDetail(detail, units) : undefined),
    [detail, units, unitsReady],
  );

  const interfaceLang: Locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr';
  const prompt = useMemo(
    () =>
      detail && lang
        ? translationPrompt({
            locale: interfaceLang,
            from: detail.baseLang,
            to: lang,
            markdown: detailMarkdown(detail),
          })
        : '',
    [detail, lang, interfaceLang],
  );

  const text = answer ?? (existing ? detailMarkdown(existing) : '');
  const preview = useMemo(
    () => (text.trim() ? translationPreview(text, baseDocument, units) : undefined),
    [text, baseDocument, units],
  );
  const display = useMemo(
    () =>
      preview?.ok && lang
        ? displayRecipe(preview.document, preview.document.servings, lang, units)
        : undefined,
    [preview, lang, units],
  );

  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
    await navigate(`/recipes/${encodeURIComponent(id)}?lang=${lang ?? ''}`);
  };

  const save = useMutation({
    mutationFn: () => saveTranslation(id, lang ?? 'en', preview?.markdown ?? ''),
    onMutate: () => setError(undefined),
    onSuccess: async (result) => {
      // Saved: a structure that differs is shown once more before leaving.
      if (result.warnings.length) setSavedWarnings(result.warnings);
      else await done();
    },
    onError: (failure) =>
      setError(failure instanceof InvalidRecipeError ? 'invalid_recipe' : errorCode(failure)),
  });

  const removal = useMutation({
    mutationFn: () => deleteTranslation(id, lang ?? 'en'),
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      await navigate(`/recipes/${encodeURIComponent(id)}`);
    },
    onError: (failure) => {
      setConfirmDelete(false);
      setError(errorCode(failure));
    },
  });

  const invalidTarget =
    detail !== undefined && (!lang || !detail.isOwner || lang === detail.baseLang);

  return {
    status:
      base.isError || invalidTarget
        ? 'not_found'
        : base.isPending || !unitsReady || (exists && current.isPending)
          ? 'loading'
          : 'ready',
    id,
    lang,
    baseLang: detail?.baseLang,
    title: detail?.title ?? '',
    exists,
    prompt,
    copied,
    copyPrompt: async () => {
      try {
        await navigator.clipboard.writeText(prompt);
        setCopied(true);
      } catch {
        // No clipboard access: the prompt stays selectable.
      }
    },
    answer: text,
    setAnswer: (value: string) => {
      setAnswer(value);
      setSavedWarnings(undefined);
    },
    preview: display,
    ok: preview?.ok ?? false,
    diagnostics: preview?.diagnostics ?? [],
    durationText,
    error,
    saving: save.isPending,
    save: () => save.mutate(),
    /** Warnings of the translation just saved (structure different from the base language). */
    savedWarnings,
    leave: () => void done(),
    deleting: removal.isPending,
    confirmDelete,
    askDelete: () => setConfirmDelete(true),
    cancelDelete: () => setConfirmDelete(false),
    deleteTranslation: () => removal.mutate(),
  };
}
