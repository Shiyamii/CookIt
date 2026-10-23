import { RECIPE_SUMMARY_MAX, SUPPORTED_LOCALES, type Locale } from '@cookit/shared';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PresentationField } from '../model/editor-actions';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { useRecipeEditorViewModel } from '../viewmodels/useRecipeEditorViewModel';
import { GroupsEditor } from './GroupsEditor';

export type EditorVm = ReturnType<typeof useRecipeEditorViewModel>;

/** The visual editor: part 1 as a form, then ingredient and step groups. */
export function VisualEditor({ vm }: { vm: EditorVm }) {
  const { t } = useTranslation();
  const { recipe, dispatch } = vm;
  const setField = (field: PresentationField, value: string) =>
    dispatch({ type: 'setField', field, value });

  return (
    <div className="grid grid-cols-1 gap-8">
      <section className="grid gap-4" aria-labelledby="presentation-title">
        <h2 id="presentation-title" className="sr-only">
          {t('recipes.editor.presentation')}
        </h2>
        <FormField
          label={t('recipes.fields.title')}
          required
          value={recipe.title}
          onChange={(event) => setField('title', event.target.value)}
          error={vm.invalid.includes('title') ? t('recipes.invalid.title') : undefined}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            label={t('recipes.fields.servings')}
            inputMode="numeric"
            required
            value={recipe.servings}
            onChange={(event) => setField('servings', event.target.value)}
            error={vm.invalid.includes('servings') ? t('recipes.invalid.servings') : undefined}
          />
          {vm.isNew && (
            <div className="grid content-start gap-2">
              <Label htmlFor="recipe-lang">{t('recipes.fields.lang')}</Label>
              <Select value={vm.lang} onValueChange={(value) => vm.setLang(value as Locale)}>
                <SelectTrigger id="recipe-lang" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((locale) => (
                    <SelectItem key={locale} value={locale}>
                      {t(`language.${locale}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <FormField
          label={t('recipes.fields.summary')}
          hint={t('recipes.hints.summary', { max: RECIPE_SUMMARY_MAX })}
          value={recipe.summary}
          onChange={(event) => setField('summary', event.target.value)}
          error={
            vm.invalid.includes('summary')
              ? t('recipes.invalid.summary', { max: RECIPE_SUMMARY_MAX })
              : undefined
          }
        />
        <div className="grid gap-2">
          <Label htmlFor="recipe-description">{t('recipes.fields.description')}</Label>
          <Textarea
            id="recipe-description"
            rows={3}
            value={recipe.description}
            onChange={(event) => setField('description', event.target.value)}
          />
        </div>
        <FormField
          label={t('recipes.fields.source')}
          hint={t('recipes.hints.source')}
          value={recipe.source}
          onChange={(event) => setField('source', event.target.value)}
        />

        {vm.tagPickers.length > 0 && (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">{t('recipes.tags')}</legend>
            {vm.tagPickers.map((picker) => (
              <div
                key={picker.id}
                role="group"
                aria-label={picker.label}
                className="grid gap-1.5"
                data-testid="tag-picker"
              >
                <p className="text-sm text-muted-foreground">
                  {picker.label}
                  {!picker.multiple && ` · ${t('recipes.editor.oneTag')}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {picker.tags.map((tag) => (
                    <Button
                      key={tag.id}
                      type="button"
                      size="sm"
                      variant={tag.selected ? 'default' : 'outline'}
                      aria-pressed={tag.selected}
                      className="rounded-full"
                      onClick={() => vm.toggleTag(picker.id, tag.id)}
                    >
                      {tag.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        {recipe.extraMeta.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('recipes.fields.extraMeta')}</legend>
            {vm.invalid.includes('extraMeta') && (
              <p className="text-sm text-destructive">{t('recipes.invalid.extraMeta')}</p>
            )}
            {recipe.extraMeta.map((meta) => (
              <div key={meta.id} className="flex items-center gap-2">
                <Input
                  aria-label={t('recipes.fields.metaKey')}
                  className="h-11 w-32 shrink-0 sm:w-40"
                  value={meta.key}
                  onChange={(event) =>
                    dispatch({
                      type: 'setMeta',
                      id: meta.id,
                      key: event.target.value,
                      value: meta.value,
                    })
                  }
                />
                <Input
                  aria-label={t('recipes.fields.metaValue')}
                  className="h-11 min-w-0 flex-1"
                  value={meta.value}
                  onChange={(event) =>
                    dispatch({
                      type: 'setMeta',
                      id: meta.id,
                      key: meta.key,
                      value: event.target.value,
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('recipes.editor.removeMeta')}
                  onClick={() => dispatch({ type: 'removeMeta', id: meta.id })}
                >
                  <X />
                </Button>
              </div>
            ))}
          </fieldset>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="justify-self-start"
          onClick={() => dispatch({ type: 'addMeta' })}
        >
          <Plus /> {t('recipes.editor.addMeta')}
        </Button>
      </section>

      <GroupsEditor vm={vm} part="ingredients" />
      <GroupsEditor vm={vm} part="steps" />
    </div>
  );
}
