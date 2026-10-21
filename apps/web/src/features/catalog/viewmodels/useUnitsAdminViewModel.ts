import type { LocalizedLabels, Unit, UnitEntry, UnitRounding } from '@cookit/shared';
import { SUPPORTED_LOCALES, unitInputSchema } from '@cookit/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiError, errorCode } from '@/lib/api';
import {
  createUnit,
  deleteUnit,
  fetchUnits,
  moved,
  parseAliases,
  reorderUnits,
  slugFromLabel,
  UNITS_QUERY_KEY,
  updateUnit,
} from '../model/catalog';
import { useTagCatalog } from './useCatalogs';

export type UnitForm = {
  slug: string;
  rounding: UnitRounding;
  labels: Record<string, string>;
  /** Aliases as typed: one per line or comma-separated. */
  aliases: Record<string, string>;
};

const emptyForm = (): UnitForm => ({
  slug: '',
  rounding: 'fraction',
  labels: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, ''])),
  aliases: Object.fromEntries(SUPPORTED_LOCALES.map((locale) => [locale, ''])),
});

function unitOf(form: UnitForm): Unit {
  const labels: LocalizedLabels = {};
  const aliases: Unit['aliases'] = {};
  for (const locale of SUPPORTED_LOCALES) {
    const label = form.labels[locale]?.trim();
    if (label) labels[locale] = label;
    const list = parseAliases(form.aliases[locale] ?? '');
    if (list.length) aliases[locale] = list;
  }
  return { slug: form.slug.trim(), rounding: form.rounding, labels, aliases };
}

/** The admin page of units (plan §3: labels, aliases per language, rounding). */
export function useUnitsAdminViewModel() {
  const queryClient = useQueryClient();
  // Same label fallback as tags (interface language first).
  const { label } = useTagCatalog();
  const query = useQuery({ queryKey: UNITS_QUERY_KEY, queryFn: fetchUnits });
  const units: UnitEntry[] = query.data ?? [];
  const [editing, setEditing] = useState<{ id?: string }>();
  const [form, setForm] = useState<UnitForm>(emptyForm());
  const [invalid, setInvalid] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UnitEntry>();
  const [error, setError] = useState<string>();
  const [conflicts, setConflicts] = useState<string[]>([]);

  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => {
      setError(undefined);
      setConflicts([]);
    },
    onSuccess: async () => {
      setEditing(undefined);
      setPendingDelete(undefined);
      // A new array: every parser on this page reads the new catalog.
      await queryClient.invalidateQueries({ queryKey: UNITS_QUERY_KEY });
    },
    onError: (failure) => {
      setError(errorCode(failure));
      const aliases = failure instanceof ApiError ? failure.details?.aliases : undefined;
      setConflicts(Array.isArray(aliases) ? aliases.map(String) : []);
    },
  });

  return {
    loading: query.isPending,
    units,
    label,
    error,
    conflicts,
    busy: run.isPending,
    editing,
    form,
    invalid,
    setSlug: (slug: string) => setForm({ ...form, slug }),
    setRounding: (rounding: UnitRounding) => setForm({ ...form, rounding }),
    setLabel: (locale: string, value: string) => {
      const slug =
        editing?.id === undefined &&
        (form.slug === '' || form.slug === slugFromLabel(form.labels[locale] ?? ''))
          ? slugFromLabel(value)
          : form.slug;
      setForm({ ...form, labels: { ...form.labels, [locale]: value }, slug });
    },
    setAliases: (locale: string, value: string) =>
      setForm({ ...form, aliases: { ...form.aliases, [locale]: value } }),
    startNew: () => {
      setForm(emptyForm());
      setInvalid(false);
      setEditing({});
    },
    startEdit: (unit: UnitEntry) => {
      const base = emptyForm();
      setForm({
        slug: unit.slug,
        rounding: unit.rounding,
        labels: { ...base.labels, ...unit.labels },
        aliases: {
          ...base.aliases,
          ...Object.fromEntries(
            Object.entries(unit.aliases).map(([locale, list]) => [locale, (list ?? []).join(', ')]),
          ),
        },
      });
      setInvalid(false);
      setEditing({ id: unit.id });
    },
    cancelEdit: () => setEditing(undefined),
    submit: (event: FormEvent) => {
      event.preventDefault();
      if (!editing) return;
      const unit = unitOf(form);
      const valid = unitInputSchema.safeParse(unit).success;
      setInvalid(!valid);
      if (!valid) return;
      const { id } = editing;
      run.mutate(() => (id ? updateUnit(id, unit) : createUnit(unit)));
    },
    move: (id: string, direction: -1 | 1) =>
      run.mutate(() =>
        reorderUnits(
          moved(
            units.map((u) => u.id),
            id,
            direction,
          ),
        ),
      ),
    pendingDelete,
    askDelete: (unit: UnitEntry) => setPendingDelete(unit),
    cancelDelete: () => setPendingDelete(undefined),
    confirmDelete: () => pendingDelete && run.mutate(() => deleteUnit(pendingDelete.id)),
  };
}
