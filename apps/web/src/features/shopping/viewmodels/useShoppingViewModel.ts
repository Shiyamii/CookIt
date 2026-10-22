import { MAX_SHOPPING_ENTRIES } from '@cookit/shared';
import { useMemo, useState } from 'react';
import {
  addItem,
  clearChecked,
  EMPTY_LIST,
  removeRecipe,
  setChecked,
  shoppingLines,
  type ShoppingLine,
} from '../model/list';
import { useShoppingSync } from './useShoppingSync';

/**
 * The shopping list page (`/shopping`): merged lines to check off, free items, the recipes they
 * come from. Every change is saved (local copy, then server), so it works in the shop offline.
 */
export function useShoppingViewModel() {
  const { sync, snapshot } = useShoppingSync();
  const state = snapshot?.state ?? EMPTY_LIST;
  const lines = useMemo(() => shoppingLines(state), [state]);
  const [item, setItem] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const remaining = lines.filter((line) => !line.checked).length;
  const full = state.entries.length >= MAX_SHOPPING_ENTRIES;

  return {
    loading: !snapshot?.ready && snapshot?.state === null,
    lines,
    remaining,
    checkedCount: lines.length - remaining,
    recipes: state.recipes,
    item,
    setItem,
    full,
    addItem: () => {
      if (!item.trim() || full) return;
      sync?.update((current) => addItem(current, item, crypto.randomUUID()));
      setItem('');
    },
    toggle: (line: ShoppingLine) =>
      sync?.update((current) => setChecked(current, line.entryIds, !line.checked)),
    removeRecipe: (recipeId: string) => sync?.update((current) => removeRecipe(current, recipeId)),
    clearChecked: () => sync?.update(clearChecked),
    confirmClear,
    askClear: () => setConfirmClear(true),
    cancelClear: () => setConfirmClear(false),
    clearAll: () => {
      setConfirmClear(false);
      sync?.update(() => EMPTY_LIST);
    },
  };
}
