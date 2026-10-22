import { ListChecks, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useShoppingViewModel } from '../viewmodels/useShoppingViewModel';

/** The shopping list: what is left to buy first, checked items below. */
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
            {vm.lines.length === 0
              ? t('shopping.empty')
              : vm.remaining === 0
                ? t('shopping.allDone')
                : t('shopping.remaining', { count: vm.remaining })}
          </p>
        )}
      </header>

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
      {vm.full && <p className="text-sm text-destructive">{t('shopping.full')}</p>}

      {vm.loading ? (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      ) : vm.lines.length === 0 ? (
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
        <ul className="grid gap-1" aria-label={t('shopping.title')}>
          {vm.lines.map((line) => (
            <li key={line.key}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-1 py-1 hover:bg-accent">
                <Checkbox
                  className="size-6"
                  checked={line.checked}
                  onCheckedChange={() => vm.toggle(line)}
                />
                <span className="grid min-w-0">
                  <span
                    className={`wrap-anywhere ${line.checked ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {line.text}
                  </span>
                  {line.recipes.length > 0 && (
                    <span className="truncate text-xs text-muted-foreground">
                      {line.recipes.join(', ')}
                    </span>
                  )}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {vm.checkedCount > 0 && (
        <Button variant="outline" className="justify-self-start" onClick={vm.clearChecked}>
          <ListChecks /> {t('shopping.clearChecked', { count: vm.checkedCount })}
        </Button>
      )}

      {vm.recipes.length > 0 && (
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

      {vm.lines.length > 0 && (
        <Button variant="destructive" className="justify-self-start" onClick={vm.askClear}>
          <Trash2 /> {t('shopping.clearAll')}
        </Button>
      )}

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
