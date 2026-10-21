import { SUPPORTED_LOCALES } from '@cookit/shared';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
import {
  AlertDialog,
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
import { useTagsAdminViewModel } from '../viewmodels/useTagsAdminViewModel';

type Vm = ReturnType<typeof useTagsAdminViewModel>;

/** Admin page "Categories and tags" (plan §4). */
export function TagsAdminPage() {
  const { t } = useTranslation();
  const vm = useTagsAdminViewModel();
  const { pendingDelete } = vm;

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('catalog.tags.title')}</h1>
      <p className="text-muted-foreground">{t('catalog.tags.intro')}</p>
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}
      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}

      {vm.categories.map((category, index) => (
        <section
          key={category.id}
          data-testid="tag-category"
          aria-label={vm.label(category.labels, category.slug)}
          className="grid min-w-0 gap-3 rounded-lg border p-4"
        >
          {vm.editing?.kind === 'category' && vm.editing.id === category.id ? (
            <ItemForm vm={vm} />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold wrap-anywhere">
                  {vm.label(category.labels, category.slug)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {category.slug} ·{' '}
                  {category.multiple ? t('catalog.tags.multiple') : t('catalog.tags.single')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('catalog.moveUp')}
                disabled={index === 0 || vm.busy}
                onClick={() => vm.moveCategory(category.id, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('catalog.moveDown')}
                disabled={index === vm.categories.length - 1 || vm.busy}
                onClick={() => vm.moveCategory(category.id, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('catalog.tags.editCategory')}
                onClick={() => vm.startEditCategory(category)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('catalog.tags.deleteCategory')}
                disabled={vm.busy}
                onClick={() => vm.deleteCategory(category.id)}
              >
                <Trash2 />
              </Button>
            </div>
          )}

          <ul className="grid gap-1">
            {category.tags.map((tag, tagIndex) => (
              <li key={tag.id} data-testid="tag-row" className="min-w-0">
                {vm.editing?.kind === 'tag' && vm.editing.id === tag.id ? (
                  <ItemForm vm={vm} />
                ) : (
                  <div className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent/50">
                    <div className="min-w-0 flex-1">
                      <span className="wrap-anywhere">{vm.label(tag.labels, tag.slug)}</span>{' '}
                      <span className="text-xs text-muted-foreground">
                        {tag.slug} · {t('catalog.tags.recipes', { count: tag.recipeCount })}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('catalog.moveUp')}
                      disabled={tagIndex === 0 || vm.busy}
                      onClick={() => vm.moveTag(category, tag.id, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('catalog.moveDown')}
                      disabled={tagIndex === category.tags.length - 1 || vm.busy}
                      onClick={() => vm.moveTag(category, tag.id, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('catalog.tags.editTag', { tag: tag.slug })}
                      onClick={() => vm.startEditTag(tag)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('catalog.tags.deleteTag', { tag: tag.slug })}
                      onClick={() => vm.askDeleteTag(tag)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {vm.editing?.kind === 'tag' &&
          vm.editing.id === undefined &&
          vm.form.categoryId === category.id ? (
            <ItemForm vm={vm} />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => vm.startNewTag(category.id)}
            >
              <Plus /> {t('catalog.tags.addTag')}
            </Button>
          )}
        </section>
      ))}

      {vm.editing?.kind === 'category' && vm.editing.id === undefined ? (
        <section className="rounded-lg border p-4">
          <ItemForm vm={vm} />
        </section>
      ) : (
        <Button variant="outline" className="justify-self-start" onClick={vm.startNewCategory}>
          <Plus /> {t('catalog.tags.addCategory')}
        </Button>
      )}

      <AlertDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && vm.cancelDeleteTag()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('catalog.tags.deleteTitle', {
                tag: pendingDelete ? vm.label(pendingDelete.labels, pendingDelete.slug) : '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.recipeCount > 0
                ? t('catalog.tags.deleteUsed', { count: pendingDelete.recipeCount })
                : t('catalog.tags.deleteUnused')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete && pendingDelete.recipeCount > 0 && (
            <div className="grid gap-2">
              <Label htmlFor="merge-into">{t('catalog.tags.mergeInto')}</Label>
              <Select value={vm.mergeInto} onValueChange={vm.setMergeInto}>
                <SelectTrigger id="merge-into" className="h-11 w-full">
                  <SelectValue placeholder={t('catalog.tags.noMerge')} />
                </SelectTrigger>
                <SelectContent>
                  {vm.mergeTargets.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {vm.label(tag.labels, tag.slug)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={vm.busy} onClick={vm.confirmDeleteTag}>
              {vm.mergeInto ? t('catalog.tags.merge') : t('catalog.tags.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Form of a category or a tag: labels per language, slug, and its own option. */
function ItemForm({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  const isCategory = vm.editing?.kind === 'category';
  return (
    <form
      className="grid gap-3 rounded-md bg-muted/40 p-3"
      onSubmit={vm.submit}
      noValidate
      aria-label={isCategory ? t('catalog.tags.categoryForm') : t('catalog.tags.tagForm')}
    >
      {vm.invalid.includes('labels') && (
        <p className="text-sm text-destructive">{t('catalog.invalid.labels')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {SUPPORTED_LOCALES.map((locale) => (
          <FormField
            key={locale}
            label={t('catalog.labelIn', { language: t(`language.${locale}`) })}
            value={vm.form.labels[locale] ?? ''}
            onChange={(event) => vm.setLabel(locale, event.target.value)}
          />
        ))}
      </div>
      <FormField
        label={t('catalog.slug')}
        hint={t('catalog.slugHint')}
        value={vm.form.slug}
        onChange={(event) => vm.setSlug(event.target.value)}
        error={vm.invalid.includes('slug') ? t('catalog.invalid.slug') : undefined}
      />
      {isCategory ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={vm.form.multiple}
            onChange={(event) => vm.setMultiple(event.target.checked)}
          />
          {t('catalog.tags.allowMultiple')}
        </label>
      ) : (
        vm.editing?.id !== undefined && (
          <div className="grid gap-2">
            <Label htmlFor="tag-category">{t('catalog.tags.category')}</Label>
            <Select value={vm.form.categoryId} onValueChange={vm.setCategoryId}>
              <SelectTrigger id="tag-category" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vm.categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {vm.label(category.labels, category.slug)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      )}
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
