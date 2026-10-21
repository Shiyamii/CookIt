import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { EditorRow, IngredientParts } from '../model/editor';
import { ItemMenu } from './GroupsEditor';
import type { EditorVm } from './VisualEditor';

/**
 * An ingredient: quantity, unit (with suggestions) and the rest of the line. The fields keep what
 * is typed (the row text is rebuilt from them); they are only read again from the row text when it
 * changes from elsewhere. A line the parser keeps as written, or written on several lines, is
 * edited as plain text.
 */
export function IngredientRowEditor({
  vm,
  row,
  handle,
  canUp,
  canDown,
}: {
  vm: EditorVm;
  row: EditorRow;
  handle: ReactNode;
  canUp: boolean;
  canDown: boolean;
}) {
  const { t } = useTranslation();
  const listId = useId();
  const [parts, setParts] = useState<IngredientParts>(() => vm.ingredientParts(row.raw));
  const [shownRaw, setShownRaw] = useState(row.raw);
  if (row.raw !== shownRaw) {
    // Changed elsewhere (draft restored, markdown editor): read the fields again.
    setShownRaw(row.raw);
    setParts(vm.ingredientParts(row.raw));
  }

  const setRaw = (raw: string) => {
    setShownRaw(raw);
    vm.dispatch({ type: 'setRow', part: 'ingredients', rowId: row.id, raw });
  };
  const change = (field: keyof IngredientParts, value: string) => {
    const next = { ...parts, [field]: value };
    setParts(next);
    setRaw(vm.joinIngredient(next));
  };

  const menu = (
    <ItemMenu
      label={t('recipes.editor.rowActions')}
      canUp={canUp}
      canDown={canDown}
      onUp={() =>
        vm.dispatch({ type: 'shiftRow', part: 'ingredients', rowId: row.id, direction: -1 })
      }
      onDown={() =>
        vm.dispatch({ type: 'shiftRow', part: 'ingredients', rowId: row.id, direction: 1 })
      }
      onDelete={() => vm.dispatch({ type: 'removeRow', part: 'ingredients', rowId: row.id })}
      deleteLabel={t('recipes.editor.deleteRow')}
    />
  );

  if (row.kind === 'text' || row.raw.includes('\n')) {
    return (
      <div className="flex items-start gap-1" data-testid="ingredient-row">
        {handle}
        <Textarea
          aria-label={
            row.kind === 'text' ? t('recipes.editor.freeText') : t('recipes.editor.ingredient')
          }
          rows={2}
          className="min-w-0 flex-1 wrap-anywhere"
          value={row.raw}
          onChange={(event) => setRaw(event.target.value)}
        />
        {menu}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap" data-testid="ingredient-row">
      {handle}
      <Input
        aria-label={t('recipes.editor.quantity')}
        placeholder="250"
        inputMode="decimal"
        className="h-10 w-16 shrink-0"
        value={parts.quantity}
        onChange={(event) => change('quantity', event.target.value)}
      />
      <Input
        aria-label={t('recipes.editor.unit')}
        placeholder="g"
        list={listId}
        className="h-10 w-24 shrink-0"
        value={parts.unit}
        onChange={(event) => change('unit', event.target.value)}
      />
      <datalist id={listId}>
        {vm.unitSuggestions.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
      <div className="ml-auto sm:hidden">{menu}</div>
      <Input
        aria-label={t('recipes.editor.ingredientName')}
        placeholder={t('recipes.editor.ingredientPlaceholder')}
        className="h-10 min-w-0 basis-full sm:basis-auto sm:flex-1"
        value={parts.rest}
        onChange={(event) => change('rest', event.target.value)}
      />
      <div className="hidden sm:block">{menu}</div>
    </div>
  );
}
