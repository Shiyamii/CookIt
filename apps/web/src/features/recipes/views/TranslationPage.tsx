import { Check, Copy, Trash2 } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { useTranslationViewModel } from '../viewmodels/useTranslationViewModel';
import { DiagnosticsList } from './DiagnosticsList';
import { RecipeContent } from './RecipeContent';

/** "Add a translation": prompt to copy, AI answer to paste, live preview and warnings. */
export function TranslationPage() {
  const { t } = useTranslation();
  const vm = useTranslationViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'not_found' || !vm.lang || !vm.baseLang) return <NotFoundPage />;

  const languages = {
    from: t(`language.${vm.baseLang}`),
    to: t(`language.${vm.lang}`),
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">
          {t(vm.exists ? 'recipes.translate.editTitle' : 'recipes.translate.title', {
            language: languages.to,
          })}
        </h1>
        <p className="wrap-anywhere text-muted-foreground">
          <Link to={`/recipes/${vm.id}`} className="underline underline-offset-2">
            {vm.title}
          </Link>
        </p>
      </header>

      <section className="grid gap-3" aria-labelledby="prompt-title">
        <h2 id="prompt-title" className="font-semibold">
          {t('recipes.translate.promptTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('recipes.translate.promptText', languages)}
        </p>
        <Button className="justify-self-start" onClick={() => void vm.copyPrompt()}>
          {vm.copied ? <Check /> : <Copy />}
          {vm.copied ? t('common.copied') : t('recipes.ai.copyPrompt')}
        </Button>
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {t('recipes.ai.showPrompt')}
          </summary>
          <Textarea
            readOnly
            aria-label={t('recipes.ai.prompt')}
            rows={10}
            className="mt-2 font-mono text-xs wrap-anywhere"
            value={vm.prompt}
            onFocus={(event) => event.target.select()}
          />
        </details>
      </section>

      <section className="grid gap-3">
        <Label htmlFor="translation-answer" className="font-semibold">
          {t('recipes.translate.answerLabel', { language: languages.to })}
        </Label>
        <Textarea
          id="translation-answer"
          rows={12}
          className="font-mono text-sm wrap-anywhere"
          placeholder={t('recipes.ai.answerPlaceholder')}
          value={vm.answer}
          onChange={(event) => vm.setAnswer(event.target.value)}
        />
        <DiagnosticsList diagnostics={vm.diagnostics} />
      </section>

      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}

      {vm.savedWarnings && (
        <Alert role="status">
          <AlertDescription className="grid gap-2">
            <p>{t('recipes.translate.savedWithWarnings')}</p>
            <DiagnosticsList diagnostics={vm.savedWarnings} />
            <Button className="justify-self-start" onClick={vm.leave}>
              {t('recipes.translate.backToRecipe')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {vm.preview && (
        <section className="grid gap-3 rounded-lg border p-4" aria-labelledby="preview-title">
          <h2 id="preview-title" className="font-semibold">
            {t('recipes.editor.preview')}
          </h2>
          <h3 className="text-xl font-semibold wrap-anywhere">{vm.preview.title}</h3>
          <RecipeContent recipe={vm.preview} durationText={vm.durationText} />
        </section>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button onClick={vm.save} disabled={!vm.ok || vm.saving || vm.savedWarnings !== undefined}>
          {t('recipes.translate.save')}
        </Button>
        <Button variant="ghost" asChild>
          <Link to={`/recipes/${vm.id}`}>{t('common.cancel')}</Link>
        </Button>
        {vm.exists && (
          <Button
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={vm.askDelete}
            disabled={vm.deleting}
          >
            <Trash2 /> {t('recipes.translate.delete')}
          </Button>
        )}
      </div>

      <AlertDialog open={vm.confirmDelete} onOpenChange={(open) => !open && vm.cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('recipes.translate.deleteTitle', { language: languages.to })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('recipes.translate.deleteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.deleteTranslation}>
              {t('recipes.translate.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
