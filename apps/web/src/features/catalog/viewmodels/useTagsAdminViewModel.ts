import type { AdminTag, AdminTagCategory, LocalizedLabels } from '@cookit/shared';
import { slugSchema, SUPPORTED_LOCALES } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { errorCode } from '@/lib/api';
import {
  ADMIN_TAGS_QUERY_KEY,
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  fetchAdminTags,
  moved,
  reorderCategories,
  reorderTags,
  slugFromLabel,
  TAGS_QUERY_KEY,
  updateCategory,
  updateTag,
} from '../model/catalog';
import { useTagCatalog } from './useCatalogs';

/** The form of a category or a tag: slug and one label per language. */
export type LabelsForm = {
  slug: string;
  labels: Record<string, string>;
  multiple: boolean;
  categoryId: string;
};

/** What is being edited: a new or existing category, or a new or existing tag. */
export type Editing = { kind: 'category'; id?: string } | { kind: 'tag'; id?: string };

const emptyForm = (categoryId = ''): LabelsForm => ({
  slug: '',
  labels: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, ''])),
  multiple: false,
  categoryId,
});

function labelsOf(form: LabelsForm): LocalizedLabels {
  const labels: LocalizedLabels = {};
  for (const locale of SUPPORTED_LOCALES) {
    const value = form.labels[locale]?.trim();
    if (value) labels[locale] = value;
  }
  return labels;
}

/** The admin page of tag categories and tags (plan §4). */
export function useTagsAdminViewModel() {
  const queryClient = useQueryClient();
  const { label } = useTagCatalog();
  const query = useQuery({ queryKey: ADMIN_TAGS_QUERY_KEY, queryFn: fetchAdminTags });
  const categories: AdminTagCategory[] = query.data ?? [];
  const [editing, setEditing] = useState<Editing>();
  const [form, setForm] = useState<LabelsForm>(emptyForm());
  const [invalid, setInvalid] = useState<('slug' | 'labels')[]>([]);
  const [pendingDelete, setPendingDelete] = useState<AdminTag>();
  const [mergeInto, setMergeInto] = useState('');
  const [error, setError] = useState<string>();

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_TAGS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: TAGS_QUERY_KEY });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<void>) => action(),
    onMutate: () => setError(undefined),
    onSuccess: async () => {
      setEditing(undefined);
      setPendingDelete(undefined);
      await refresh();
    },
    onError: async (failure) => {
      setError(errorCode(failure));
      await refresh();
    },
  });

  const allTags = categories.flatMap((category) => category.tags);

  return {
    loading: query.isPending,
    loadError: query.isError,
    categories,
    label,
    error,
    busy: run.isPending,
    editing,
    form,
    invalid,
    setSlug: (slug: string) => setForm({ ...form, slug }),
    setLabel: (locale: string, value: string) => {
      const labels = { ...form.labels, [locale]: value };
      // A new item gets its slug from its first label, until the slug is typed.
      const slug =
        editing?.id === undefined &&
        (form.slug === '' || form.slug === slugFromLabel(form.labels[locale] ?? ''))
          ? slugFromLabel(value)
          : form.slug;
      setForm({ ...form, labels, slug });
    },
    setMultiple: (multiple: boolean) => setForm({ ...form, multiple }),
    setCategoryId: (categoryId: string) => setForm({ ...form, categoryId }),
    startNewCategory: () => {
      setForm(emptyForm());
      setInvalid([]);
      setEditing({ kind: 'category' });
    },
    startEditCategory: (category: AdminTagCategory) => {
      setForm({
        slug: category.slug,
        labels: { ...emptyForm().labels, ...category.labels },
        multiple: category.multiple,
        categoryId: '',
      });
      setInvalid([]);
      setEditing({ kind: 'category', id: category.id });
    },
    startNewTag: (categoryId: string) => {
      setForm(emptyForm(categoryId));
      setInvalid([]);
      setEditing({ kind: 'tag' });
    },
    startEditTag: (tag: AdminTag) => {
      setForm({
        slug: tag.slug,
        labels: { ...emptyForm().labels, ...tag.labels },
        multiple: false,
        categoryId: tag.categoryId,
      });
      setInvalid([]);
      setEditing({ kind: 'tag', id: tag.id });
    },
    cancelEdit: () => setEditing(undefined),
    submit: (event: FormEvent) => {
      event.preventDefault();
      if (!editing) return;
      const labels = labelsOf(form);
      const wrong: ('slug' | 'labels')[] = [];
      if (!slugSchema.safeParse(form.slug).success) wrong.push('slug');
      if (Object.keys(labels).length === 0) wrong.push('labels');
      setInvalid(wrong);
      if (wrong.length) return;
      const slug = form.slug.trim();
      const { id } = editing;
      if (editing.kind === 'category') {
        const input = { slug, labels, multiple: form.multiple };
        run.mutate(() => (id ? updateCategory(id, input) : createCategory(input)));
      } else {
        const input = { slug, labels, categoryId: form.categoryId };
        run.mutate(() => (id ? updateTag(id, input) : createTag(input)));
      }
    },
    moveCategory: (id: string, direction: -1 | 1) =>
      run.mutate(() =>
        reorderCategories(
          moved(
            categories.map((c) => c.id),
            id,
            direction,
          ),
        ),
      ),
    moveTag: (category: AdminTagCategory, id: string, direction: -1 | 1) =>
      run.mutate(() =>
        reorderTags(
          category.id,
          moved(
            category.tags.map((t) => t.id),
            id,
            direction,
          ),
        ),
      ),
    deleteCategory: (id: string) => run.mutate(() => deleteCategory(id)),
    // Deleting a tag: confirmed when used by recipes, or merged into another tag.
    pendingDelete,
    mergeTargets: allTags.filter((tag) => tag.id !== pendingDelete?.id),
    mergeInto,
    setMergeInto,
    askDeleteTag: (tag: AdminTag) => {
      setMergeInto('');
      setPendingDelete(tag);
    },
    cancelDeleteTag: () => setPendingDelete(undefined),
    confirmDeleteTag: () => {
      if (!pendingDelete) return;
      const id = pendingDelete.id;
      run.mutate(() =>
        mergeInto ? deleteTag(id, { mergeInto }) : deleteTag(id, { confirm: true }),
      );
    },
  };
}
