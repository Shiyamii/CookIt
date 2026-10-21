import { SUPPORTED_LOCALES, UNIT_ROUNDINGS, type UnitRounding } from '@cookit/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUnitsAdminViewModel } from '../viewmodels/useUnitsAdminViewModel';

type Vm = ReturnType<typeof useUnitsAdminViewModel>;

/** Admin page "Units" (plan §3). Changing a unit never changes recipe texts. */
export function UnitsAdminPage() {
  const { t } = useTranslation();
  const vm = useUnitsAdminViewModel();

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('catalog.units.title')}</h1>
      <p className="text-muted-foreground">{t('catalog.units.intro')}</p>
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {t(`errors.${vm.error}`, t('errors.unknown'))}
            {vm.conflicts.length > 0 && ` (${vm.conflicts.join(', ')})`}
          </AlertDescription>
        </Alert>
      )}
      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}

      {vm.editing?.id === undefined && vm.editing ? (
        <UnitFormView vm={vm} />
      ) : (
        <Button variant="outline" className="justify-self-start" onClick={vm.startNew}>
          <Plus /> {t('catalog.units.add')}
        </Button>
      )}

      <ul className="grid gap-2">
        {vm.units.map((unit, index) => (
          <li key={unit.id} data-testid="unit-row" className="min-w-0 rounded-lg border p-3">
            {vm.editing?.id === unit.id ? (
              <UnitFormView vm={vm} />
            ) : (
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium wrap-anywhere">
                    {vm.label(unit.labels, unit.slug)}{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      {unit.slug} · {t(`catalog.units.rounding.${unit.rounding}`)}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground wrap-anywhere">
                    {SUPPORTED_LOCALES.flatMap((locale) => unit.aliases[locale] ?? []).join(', ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.moveUp')}
                  disabled={index === 0 || vm.busy}
                  onClick={() => vm.move(unit.id, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.moveDown')}
                  disabled={index === vm.units.length - 1 || vm.busy}
                  onClick={() => vm.move(unit.id, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.units.edit', { unit: unit.slug })}
                  onClick={() => vm.startEdit(unit)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('catalog.units.delete', { unit: unit.slug })}
                  onClick={() => vm.askDelete(unit)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog
        open={vm.pendingDelete !== undefined}
        onOpenChange={(open) => !open && vm.cancelDelete()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('catalog.units.deleteTitle', { unit: vm.pendingDelete?.slug ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('catalog.units.deleteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.confirmDelete}>
              {t('catalog.units.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UnitFormView({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <form
      className="grid gap-3 rounded-md bg-muted/40 p-3"
      onSubmit={vm.submit}
      noValidate
      aria-label={t('catalog.units.form')}
    >
      {vm.invalid && <p className="text-sm text-destructive">{t('catalog.invalid.unit')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <FormField
            key={locale}
            label={t('catalog.labelIn', { language: t(`language.${locale}`) })}
            value={vm.form.labels[locale] ?? ''}
            onChange={(event) => vm.setLabel(locale, event.target.value)}
          />
        ))}
        {SUPPORTED_LOCALES.map((locale) => (
          <div key={locale} className="grid gap-2">
            <Label htmlFor={`aliases-${locale}`}>
              {t('catalog.units.aliasesIn', { language: t(`language.${locale}`) })}
            </Label>
            <Textarea
              id={`aliases-${locale}`}
              rows={2}
              className="wrap-anywhere"
              placeholder={t('catalog.units.aliasesPlaceholder')}
              value={vm.form.aliases[locale] ?? ''}
              onChange={(event) => vm.setAliases(locale, event.target.value)}
            />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={t('catalog.slug')}
          hint={t('catalog.slugHint')}
          value={vm.form.slug}
          onChange={(event) => vm.setSlug(event.target.value)}
        />
        <div className="grid content-start gap-2">
          <Label htmlFor="unit-rounding">{t('catalog.units.roundingLabel')}</Label>
          <Select
            value={vm.form.rounding}
            onValueChange={(value) => vm.setRounding(value as UnitRounding)}
          >
            <SelectTrigger id="unit-rounding" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_ROUNDINGS.map((rounding) => (
                <SelectItem key={rounding} value={rounding}>
                  {t(`catalog.units.rounding.${rounding}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={vm.busy}>
          {t('catalog.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={vm.cancelEdit}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
