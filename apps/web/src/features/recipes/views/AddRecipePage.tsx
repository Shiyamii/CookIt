import { SUPPORTED_LOCALES, type Locale } from '@cookit/shared';
import { FileUp, ListChecks, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuickCreateViewModel } from '../viewmodels/useQuickCreateViewModel';

/**
 * "Add a recipe" (plan §5.2): one entry point, from the quickest way to the most complete one.
 * Every mode ends in the same recipe, editable afterwards in both editors.
 */
export function AddRecipePage() {
  const { t } = useTranslation();
  const vm = useQuickCreateViewModel();

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('recipes.add.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('recipes.add.quickTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('recipes.add.quickText')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={vm.submit} noValidate>
            {vm.error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
              </Alert>
            )}
            <FormField
              label={t('recipes.fields.title')}
              required
              value={vm.title}
              onChange={(event) => vm.setTitle(event.target.value)}
              error={vm.invalid.includes('title') ? t('recipes.invalid.title') : undefined}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label={t('recipes.fields.servings')}
                inputMode="numeric"
                required
                value={vm.servings}
                onChange={(event) => vm.setServings(event.target.value)}
                error={vm.invalid.includes('servings') ? t('recipes.invalid.servings') : undefined}
              />
              <div className="grid content-start gap-2">
                <Label htmlFor="quick-lang">{t('recipes.fields.lang')}</Label>
                <Select value={vm.lang} onValueChange={(value) => vm.setLang(value as Locale)}>
                  <SelectTrigger id="quick-lang" className="h-11 w-full">
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
            </div>
            <FormField
              label={t('recipes.fields.description')}
              hint={t('recipes.add.optional')}
              value={vm.description}
              onChange={(event) => vm.setDescription(event.target.value)}
            />
            <FormField
              label={t('recipes.fields.source')}
              hint={t('recipes.add.optional')}
              value={vm.source}
              onChange={(event) => vm.setSource(event.target.value)}
            />
            <Button type="submit" className="justify-self-start" disabled={vm.submitting}>
              {t('recipes.add.quickSubmit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <ModeLink
          to="/recipes/new/wizard"
          icon={<ListChecks />}
          title={t('recipes.add.wizardTitle')}
          text={t('recipes.add.wizardText')}
        />
        <ModeLink
          to="/recipes/import"
          icon={<FileUp />}
          title={t('recipes.add.importTitle')}
          text={t('recipes.add.importText')}
        />
        <ModeLink
          to="/recipes/new/editor"
          icon={<PencilLine />}
          title={t('recipes.add.editorTitle')}
          text={t('recipes.add.editorText')}
        />
      </div>
    </div>
  );
}

function ModeLink({
  to,
  icon,
  title,
  text,
}: {
  to: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Link
      to={to}
      className="grid content-start gap-1 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex items-center gap-2 font-medium [&_svg]:size-5 [&_svg]:text-primary">
        {icon}
        {title}
      </span>
      <span className="text-sm text-muted-foreground">{text}</span>
    </Link>
  );
}
