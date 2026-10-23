import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Group,
  ListChecks,
  Plus,
  ShoppingCart,
  Trash2,
  Ungroup,
  X,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LineView } from '../model/list';
import { useShoppingViewModel } from '../viewmodels/useShoppingViewModel';

type Vm = ReturnType<typeof useShoppingViewModel>;

const lineText = (line: LineView) =>
  line.quantities ? `${line.name} (${line.quantities})` : line.name;

/**
 * The shopping list: what is left to buy in the user's order (handle or arrows), then what is
 * in the basket. "Group lines" selects lines to group into one, or splits a grouped line.
 */
export function ShoppingPage() {
  const { t } = useTranslation();
  const vm = useShoppingViewModel();

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <ShoppingCart className="size-7" aria-hidden /> {t('shopping.title')}
        </h1>
        {!vm.loading && (
          <p className="text-muted-foreground" aria-live="polite">
            {vm.empty
              ? t('shopping.empty')
              : vm.toBuy.length === 0
                ? t('shopping.allDone')
                : t('shopping.remaining', { count: vm.toBuy.length })}
          </p>
        )}
      </header>

      {!vm.grouping && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            vm.addItem();
          }}
        >
          <Input
            value={vm.item}
            onChange={(event) => vm.setItem(event.target.value)}
            placeholder={t('shopping.itemPlaceholder')}
            aria-label={t('shopping.item')}
            maxLength={200}
            className="h-11"
            disabled={vm.full}
          />
          <Button type="submit" size="lg" disabled={vm.full || !vm.item.trim()}>
            <Plus /> {t('shopping.addItem')}
          </Button>
        </form>
      )}
      {vm.full && <p className="text-sm text-destructive">{t('shopping.full')}</p>}

      {vm.loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : vm.empty ? (
        <p className="text-sm text-muted-foreground">
          {t('shopping.emptyHint')}{' '}
          <Link
            to="/recipes"
            className="font-medium text-foreground underline decoration-primary decoration-2 underline-offset-2"
          >
            {t('nav.myRecipes')}
          </Link>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {vm.grouping ? (
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {t('shopping.groupingHint')}
              </p>
            ) : (
              <span />
            )}
            {vm.grouping ? (
              <Button onClick={vm.stopGrouping}>
                <Check /> {t('shopping.done')}
              </Button>
            ) : (
              <Button variant="outline" onClick={vm.startGrouping}>
                <Group /> {t('shopping.groupLines')}
              </Button>
            )}
          </div>

          {vm.toBuy.length > 0 && <SortableLines vm={vm} />}

          {vm.inBasket.length > 0 && (
            <section aria-labelledby="shopping-basket" className="grid gap-2">
              <h2 id="shopping-basket" className="text-lg font-semibold">
                {t('shopping.inBasket', { count: vm.inBasket.length })}
              </h2>
              <ul className="grid gap-1" aria-label={t('shopping.inBasketList')}>
                {vm.inBasket.map((line) => (
                  <li key={line.id}>
                    <ListLine line={line} vm={vm} />
                  </li>
                ))}
              </ul>
              {!vm.grouping && (
                <Button variant="outline" className="justify-self-start" onClick={vm.clearChecked}>
                  <ListChecks /> {t('shopping.clearChecked', { count: vm.inBasket.length })}
                </Button>
              )}
            </section>
          )}

          {vm.grouping && (
            <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] justify-self-start">
              <Button size="lg" onClick={vm.askGroup} disabled={vm.selectedCount < 2}>
                <Group /> {t('shopping.group', { count: vm.selectedCount })}
              </Button>
            </div>
          )}
        </>
      )}

      {!vm.grouping && vm.recipes.length > 0 && (
        <section aria-labelledby="shopping-recipes" className="grid gap-2">
          <h2 id="shopping-recipes" className="text-lg font-semibold">
            {t('shopping.recipes')}
          </h2>
          <ul className="grid gap-1">
            {vm.recipes.map((recipe) => (
              <li key={recipe.recipeId} className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{recipe.title}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {t('recipes.servingsCount', { count: recipe.servings })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('shopping.removeRecipe', { title: recipe.title })}
                  onClick={() => vm.removeRecipe(recipe.recipeId)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!vm.grouping && !vm.empty && (
        <Button variant="destructive" className="justify-self-start" onClick={vm.askClear}>
          <Trash2 /> {t('shopping.clearAll')}
        </Button>
      )}

      <Dialog open={vm.naming !== undefined} onOpenChange={(open) => !open && vm.cancelGroup()}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              vm.group();
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('shopping.groupTitle')}</DialogTitle>
              <DialogDescription>{t('shopping.groupHint')}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="group-name">{t('shopping.groupName')}</Label>
              <Input
                id="group-name"
                value={vm.naming ?? ''}
                onChange={(event) => vm.setNaming(event.target.value)}
                maxLength={200}
                className="h-11"
              />
            </div>
            <DialogFooter>
              <Button type="submit" size="lg" disabled={!vm.naming?.trim()}>
                <Group /> {t('shopping.groupConfirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={vm.confirmClear} onOpenChange={(open) => !open && vm.cancelClear()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('shopping.clearAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('shopping.clearAllText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.clearAll}>
              {t('shopping.clearAll')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** The line, its quantities and recipes. */
function LineLabel({ line }: { line: LineView }) {
  return (
    <span className="grid min-w-0">
      <span className={`wrap-anywhere ${line.checked ? 'text-muted-foreground line-through' : ''}`}>
        {lineText(line)}
      </span>
      {line.recipes.length > 0 && (
        <span className="truncate text-xs text-muted-foreground">{line.recipes.join(', ')}</span>
      )}
    </span>
  );
}

/** Lines left to buy: moved with their handle (only: elsewhere a touch scrolls) or arrows. */
function SortableLines({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  const sensors = useSensors(
    // A short move before dragging: taps still work on touch screens.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) vm.moveTo(String(active.id), String(over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={vm.toBuy.map((line) => line.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="grid gap-1" aria-label={t('shopping.toBuy')}>
          {vm.toBuy.map((line, index) => (
            <SortableLine
              key={line.id}
              id={line.id}
              label={t('shopping.drag', { name: line.name })}
            >
              {(handle) => (
                <ListLine
                  line={line}
                  vm={vm}
                  handle={handle}
                  first={index === 0}
                  last={index === vm.toBuy.length - 1}
                />
              )}
            </SortableLine>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableLine({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}>
      {children(
        <button
          type="button"
          aria-label={label}
          className="-my-1 flex h-12 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>,
      )}
    </li>
  );
}

/**
 * A line: tap to check it off, or to select it while grouping. Lines left to buy also get their
 * handle and arrows; a grouped line can be split while grouping.
 */
function ListLine({
  line,
  vm,
  handle,
  first = true,
  last = true,
}: {
  line: LineView;
  vm: Vm;
  handle?: ReactNode;
  first?: boolean;
  last?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-11 items-center gap-1 rounded-md bg-background">
      {handle}
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-muted">
        {vm.grouping ? (
          <Checkbox
            className="size-6"
            checked={vm.isSelected(line.id)}
            onCheckedChange={(checked) => vm.select(line.id, checked === true)}
          />
        ) : (
          <Checkbox
            className="size-6"
            checked={line.checked}
            onCheckedChange={(checked) => vm.toggle(line.id, checked === true)}
          />
        )}
        <LineLabel line={line} />
      </label>
      {vm.grouping && line.merged && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('shopping.split', { name: line.name })}
          onClick={() => vm.split(line.id)}
        >
          <Ungroup />
        </Button>
      )}
      {handle && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('shopping.moveUp', { name: line.name })}
            disabled={first}
            onClick={() => vm.moveUp(line.id)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('shopping.moveDown', { name: line.name })}
            disabled={last}
            onClick={() => vm.moveDown(line.id)}
          >
            <ArrowDown />
          </Button>
        </>
      )}
    </div>
  );
}
