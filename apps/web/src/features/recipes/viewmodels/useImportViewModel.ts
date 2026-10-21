import {
  extractMarkdownBlock,
  importPrompt,
  isLocale,
  reviewTags,
  type Locale,
  type TagCategory,
  type TagReview,
} from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorCode } from '@/lib/api';
import { useTagCatalog, useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText } from '../model/display';
import { newId } from '../model/editor';
import {
  ImportFileError,
  importFromUrl,
  parseImport,
  readImportFile,
  type ImportSource,
} from '../model/importing';
import { createRecipeFromMarkdown, InvalidRecipeError, RECIPES_QUERY_KEY } from '../model/recipes';

export type ImportTab = 'text' | 'file' | 'url' | 'ai';

type Item = {
  id: string;
  name: string;
  markdown: string;
  /** Values found for the tags (the `tags:` line, or the page's keywords). */
  tagValues: string[];
  /** Tags chosen in the "Validate tags" step (nothing is applied without it). */
  chosen: string[];
  status: 'ready' | 'saved' | 'failed';
  error?: string;
};

/** Recognized tags start checked, at most one per single-choice category. */
function initialChoice(categories: readonly TagCategory[], review: TagReview): string[] {
  const chosen: string[] = [];
  for (const tag of review.recognized) {
    const category = categories.find((c) => c.id === tag.categoryId);
    const taken =
      category && !category.multiple && category.tags.some((t) => chosen.includes(t.id));
    if (!taken) chosen.push(tag.id);
  }
  return chosen;
}

/**
 * Importing recipes (plan §5.2): markdown pasted, `.md` files or a zip, or a web page. Each
 * recipe gets a live preview with its errors, then the "Validate tags" step: recognized tags
 * (by id or by label in any language) are proposed checked, ambiguous ones ask to choose,
 * unknown ones are shown as ignored. Saved through the normal API, private. With an AI (no AI
 * built in): a prompt to copy, generated from the format, then the answer pasted.
 */
export function useImportViewModel(initialTab: ImportTab = 'text') {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalog = useTagCatalog();
  const { units } = useUnitCatalog();
  const [tab, setTab] = useState<ImportTab>(initialTab);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState('');
  const [lang, setLangState] = useState<Locale>(
    isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr',
  );
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string>();
  const [reading, setReading] = useState(false);

  const load = (sources: ImportSource[], tagValues?: string[]) => {
    setError(undefined);
    setItems(
      sources.map((source) => {
        const parsed = parseImport(source.markdown, units);
        const values = tagValues ?? parsed.tagValues;
        return {
          id: newId(),
          name: source.name,
          markdown: source.markdown,
          tagValues: values,
          chosen: initialChoice(catalog.categories, reviewTags(catalog.categories, values)),
          status: 'ready',
        };
      }),
    );
  };

  // In the interface language, asking for a recipe in the chosen language, with the tags and
  // units of the database.
  const interfaceLang: Locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr';
  const prompt = useMemo(
    () => importPrompt({ locale: interfaceLang, lang, units, tagCategories: catalog.categories }),
    [interfaceLang, lang, units, catalog.categories],
  );

  const fromUrl = useMutation({
    mutationFn: () => importFromUrl(url.trim(), lang),
    onMutate: () => setError(undefined),
    onSuccess: (result) =>
      load([{ name: url.trim(), markdown: result.markdown }], result.tagValues),
    onError: (failure) => setError(errorCode(failure)),
  });

  // Each recipe: preview, errors, tag review and the tag pickers to complete it by hand.
  const views = useMemo(
    () =>
      items.map((item) => {
        const parsed = parseImport(item.markdown, units);
        const review = reviewTags(catalog.categories, item.tagValues);
        return {
          ...item,
          ok: parsed.ok,
          diagnostics: parsed.diagnostics,
          preview: parsed.ok
            ? displayRecipe(parsed.document, parsed.document.servings, lang, units)
            : undefined,
          review: {
            recognized: review.recognized.map((tag) => ({
              id: tag.id,
              label: catalog.label(tag.labels, tag.slug),
            })),
            ambiguous: review.ambiguous.map((entry) => ({
              value: entry.value,
              candidates: entry.candidates.map((tag) => ({
                id: tag.id,
                label: `${catalog.label(tag.labels, tag.slug)} (${tag.slug})`,
              })),
            })),
            ignored: review.ignored,
          },
          pickers: catalog.categories
            .filter((category) => category.tags.length > 0)
            .map((category) => ({
              id: category.id,
              label: catalog.label(category.labels, category.slug),
              multiple: category.multiple,
              tags: category.tags.map((tag) => ({
                id: tag.id,
                label: catalog.label(tag.labels, tag.slug),
                selected: item.chosen.includes(tag.id),
              })),
            })),
        };
      }),
    [items, units, catalog, lang],
  );

  const toggleTag = (itemId: string, tagId: string) => {
    const category = catalog.categories.find((c) => c.tags.some((t) => t.id === tagId));
    setItems((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;
        if (item.chosen.includes(tagId)) {
          return { ...item, chosen: item.chosen.filter((id) => id !== tagId) };
        }
        const others = category?.multiple
          ? item.chosen
          : item.chosen.filter((id) => !category?.tags.some((t) => t.id === id));
        return { ...item, chosen: [...others, tagId] };
      }),
    );
  };

  const save = useMutation({
    mutationFn: async () => {
      const saved: string[] = [];
      for (const item of items) {
        if (item.status === 'saved' || !parseImport(item.markdown, units).ok) continue;
        try {
          const { id } = await createRecipeFromMarkdown(item.markdown, lang, item.chosen);
          saved.push(id);
          setItems((current) =>
            current.map((i) => (i.id === item.id ? { ...i, status: 'saved' } : i)),
          );
        } catch (failure) {
          const code =
            failure instanceof InvalidRecipeError ? 'invalid_recipe' : errorCode(failure);
          setItems((current) =>
            current.map((i) => (i.id === item.id ? { ...i, status: 'failed', error: code } : i)),
          );
        }
      }
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      // One recipe: open it. Several: the list.
      if (saved.length === 1 && items.length === 1) await navigate(`/recipes/${saved[0]}`);
      else if (saved.length > 0) await navigate('/recipes');
    },
  });

  return {
    tab,
    setTab,
    text,
    setText,
    url,
    setUrl,
    lang,
    setLang: (value: Locale) => {
      setLangState(value);
      setCopied(false);
    },
    error,
    reading: reading || fromUrl.isPending,
    analyzeText: () => {
      if (text.trim()) load([{ name: '', markdown: text }]);
    },
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
    answer,
    setAnswer,
    /** The AI's answer: its code block (or the whole text), previewed like any import. */
    analyzeAnswer: () => {
      if (answer.trim()) load([{ name: '', markdown: extractMarkdownBlock(answer) }]);
    },
    readFile: async (file: File | undefined) => {
      if (!file) return;
      setReading(true);
      try {
        load(await readImportFile(file));
      } catch (failure) {
        setError(failure instanceof ImportFileError ? failure.code : 'unreadable_file');
      } finally {
        setReading(false);
      }
    },
    fetchUrl: () => {
      if (url.trim()) fromUrl.mutate();
    },
    items: views,
    /** A single recipe can be corrected in place (its errors and preview follow). */
    editMarkdown: (itemId: string, markdown: string) =>
      setItems((current) => current.map((i) => (i.id === itemId ? { ...i, markdown } : i))),
    toggleTag,
    readyCount: views.filter((item) => item.ok && item.status !== 'saved').length,
    saving: save.isPending,
    save: () => save.mutate(),
    reset: () => {
      setItems([]);
      setError(undefined);
    },
    durationText,
  };
}
