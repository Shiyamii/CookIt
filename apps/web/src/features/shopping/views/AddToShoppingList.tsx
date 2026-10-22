import { Check, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
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
import {
  useAddToShoppingViewModel,
  type AddToShoppingProps,
} from '../viewmodels/useAddToShoppingViewModel';

/** On a recipe page: puts the ingredients the user picks in the shopping list. */
export function AddToShoppingList(props: AddToShoppingProps) {
  const { t } = useTranslation();
  const vm = useAddToShoppingViewModel(props);
  if (!vm.available) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button variant="outline" onClick={vm.openDialog}>
        <ShoppingCart /> {t('shopping.add.button')}
      </Button>
      {vm.added && (
        <p role="status" className="flex items-center gap-1.5 text-sm">
          <Check className="size-4" aria-hidden /> {t('shopping.add.done')}{' '}
          <Link
            to="/shopping"
            className="font-medium underline decoration-primary decoration-2 underline-offset-2"
          >
            {t('shopping.add.see')}
          </Link>
        </p>
      )}

      <Dialog open={vm.open} onOpenChange={(open) => !open && vm.close()}>
        <DialogContent className="grid max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>{t('shopping.add.title')}</DialogTitle>
            <DialogDescription>
              {t('shopping.add.hint', { count: vm.servings })}
              {vm.inListServings !== undefined &&
                ` ${t('shopping.add.replaces', { count: vm.inListServings })}`}
            </DialogDescription>
          </DialogHeader>
          <ul className="grid content-start gap-1 overflow-y-auto">
            {vm.candidates.map((candidate, index) => (
              <li key={index}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <Checkbox
                    className="size-5"
                    checked={candidate.picked}
                    onCheckedChange={() => vm.toggle(index)}
                  />
                  <span className="wrap-anywhere">{candidate.text}</span>
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter className="grid gap-2">
            {!vm.fits && (
              <p role="alert" className="text-sm text-destructive">
                {t('shopping.full')}
              </p>
            )}
            <Button size="lg" onClick={vm.add} disabled={vm.pickedCount === 0 || !vm.fits}>
              {t('shopping.add.confirm', { count: vm.pickedCount })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
