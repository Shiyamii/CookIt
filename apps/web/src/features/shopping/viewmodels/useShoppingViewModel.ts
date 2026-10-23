import { MAX_SHOPPING_ENTRIES } from '@cookit/shared';
import { useMemo, useState } from 'react';
import {
  addItem,
  clearChecked,
  EMPTY_LIST,
  groupLines,
  groupName,
  moveLine,
  removeRecipe,
  setChecked,
  shoppingLines,
  splitLine,
} from '../model/list';
import { useShoppingSync } from './useShoppingSync';

/**
 * The shopping list page (`/shopping`): lines to check off, in the user's order, then what is in
 * the basket. Lines are moved with their handle or arrows at any time; "Group lines" selects
 * lines to group (or splits one). Every change is saved (local copy, then server), so it works in the shop offline.
 */
export function useShoppingViewModel() {
  const { sync, snapshot } = useShoppingSync();
  const state = snapshot?.state ?? EMPTY_LIST;
  const { toBuy, inBasket } = useMemo(() => shoppingLines(state), [state]);
  const [item, setItem] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [naming, setNaming] = useState<string>();
  const full = state.lines.reduce((n, line) => n + line.entries.length, 0) >= MAX_SHOPPING_ENTRIES;
  // Only lines still on the list (another device may have removed some).
  const chosen = [...toBuy, ...inBasket].filter((line) => selected.has(line.id)).map((l) => l.id);

  /** Moves a line to the place of another line left to buy. */
  const moveTo = (lineId: string, targetId: string) => {
    const from = toBuy.findIndex((line) => line.id === lineId);
    const to = toBuy.findIndex((line) => line.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    sync?.update((current) => moveLine(current, lineId, targetId, to > from ? 'after' : 'before'));
  };

  return {
    loading: !snapshot?.ready && snapshot?.state === null,
    toBuy,
    inBasket,
    empty: toBuy.length + inBasket.length === 0,
    recipes: state.recipes,
    item,
    setItem,
    full,
    addItem: () => {
      if (!item.trim() || full) return;
      sync?.update((current) =>
        addItem(current, item, { line: crypto.randomUUID(), entry: crypto.randomUUID() }),
      );
      setItem('');
    },
    toggle: (lineId: string, checked: boolean) =>
      sync?.update((current) => setChecked(current, lineId, checked)),
    removeRecipe: (recipeId: string) => sync?.update((current) => removeRecipe(current, recipeId)),
    clearChecked: () => sync?.update(clearChecked),
    confirmClear,
    askClear: () => setConfirmClear(true),
    cancelClear: () => setConfirmClear(false),
    clearAll: () => {
      setConfirmClear(false);
      sync?.update(() => EMPTY_LIST);
    },

    grouping,
    startGrouping: () => setGrouping(true),
    stopGrouping: () => {
      setGrouping(false);
      setSelected(new Set());
    },
    moveTo,
    moveUp: (lineId: string) => {
      const index = toBuy.findIndex((line) => line.id === lineId);
      const previous = toBuy[index - 1];
      if (previous) moveTo(lineId, previous.id);
    },
    moveDown: (lineId: string) => {
      const index = toBuy.findIndex((line) => line.id === lineId);
      const next = toBuy[index + 1];
      if (index >= 0 && next) moveTo(lineId, next.id);
    },
    isSelected: (lineId: string) => selected.has(lineId),
    select: (lineId: string, value: boolean) =>
      setSelected((current) => {
        const next = new Set(current);
        if (value) next.add(lineId);
        else next.delete(lineId);
        return next;
      }),
    selectedCount: chosen.length,
    split: (lineId: string) =>
      sync?.update((current) => splitLine(current, lineId, () => crypto.randomUUID())),

    /** Grouping: the name is asked first (the shortest of the names by default). */
    naming,
    setNaming,
    askGroup: () => {
      if (chosen.length >= 2) setNaming(groupName(state, chosen));
    },
    cancelGroup: () => setNaming(undefined),
    group: () => {
      if (naming === undefined || chosen.length < 2) return;
      const name = naming;
      sync?.update((current) => groupLines(current, chosen, name));
      setNaming(undefined);
      setSelected(new Set());
    },
  };
}
