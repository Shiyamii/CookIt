import type { Locale, RecipeDocument } from '@cookit/shared';
import { useMemo, useState } from 'react';
import { useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { addRecipe, canAdd, EMPTY_LIST, recipeCandidates } from '../model/list';
import { useShoppingSync } from './useShoppingSync';

export type AddToShoppingProps = {
  recipeId: string;
  title: string;
  lang: Locale;
  servings: number;
  document: RecipeDocument;
};

/**
 * "Add to the shopping list" on a recipe page: the ingredients for the servings shown, all
 * picked at first (the user unticks what they already have). A recipe already in the list is
 * replaced.
 */
export function useAddToShoppingViewModel(props: AddToShoppingProps) {
  const { sync, snapshot } = useShoppingSync();
  const { units } = useUnitCatalog();
  const state = snapshot?.state ?? EMPTY_LIST;
  const candidates = useMemo(
    () => recipeCandidates(props.document, props.servings, props.lang, units),
    [props.document, props.servings, props.lang, units],
  );
  const [open, setOpen] = useState(false);
  const [unpicked, setUnpicked] = useState<ReadonlySet<number>>(new Set());
  const [added, setAdded] = useState(false);
  const picked = candidates.filter((_, index) => !unpicked.has(index));
  const inList = state.recipes.find((recipe) => recipe.recipeId === props.recipeId);

  return {
    available: sync !== undefined && candidates.length > 0,
    open,
    openDialog: () => {
      setUnpicked(new Set());
      setOpen(true);
    },
    close: () => setOpen(false),
    candidates: candidates.map((candidate, index) => ({
      text: candidate.text,
      picked: !unpicked.has(index),
    })),
    toggle: (index: number) =>
      setUnpicked((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      }),
    pickedCount: picked.length,
    servings: props.servings,
    /** Servings it is in the list for already, if it is. */
    inListServings: inList?.servings,
    fits: canAdd(state, picked.length, props.recipeId),
    added,
    add: () => {
      if (picked.length === 0) return;
      sync?.update((current) =>
        addRecipe(
          current,
          {
            recipeId: props.recipeId,
            title: props.title,
            servings: props.servings,
            lang: props.lang,
          },
          picked,
          () => crypto.randomUUID(),
        ),
      );
      setOpen(false);
      setAdded(true);
    },
  };
}
