import { useTranslation } from 'react-i18next';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import type { EditorMode } from '../viewmodels/useRecipeEditorViewModel';
import { useRecipeEditorViewModel } from '../viewmodels/useRecipeEditorViewModel';
import { DiagnosticsList } from './DiagnosticsList';
import { MarkdownEditor } from './MarkdownEditor';
import { RecipeContent } from './RecipeContent';
import { VisualEditor } from './VisualEditor';

/** Create (`/recipes/new`) or edit (`/recipes/:id/edit`) a recipe. */
export function RecipeEditorPage() {
  const { t, i18n } = useTranslation();
  const vm = useRecipeEditorViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (vm.status === 'not_found') return <NotFoundPage />;

  const errorLines = vm.markdownDiagnostics
    .filter((d) => d.severity === 'error' && d.line !== undefined)
    .map((d) => d.line ?? 0);

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="text-2xl font-semibold">
        {vm.isNew ? t('recipes.editor.newTitle') : t('recipes.editor.editTitle')}
      </h1>

      {vm.draftSavedAt && (
        <Alert role="status">
          <AlertDescription className="grid gap-2">
            <p>
              {t('recipes.editor.draftFound', {
                date: new Date(vm.draftSavedAt).toLocaleString(i18n.language),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={vm.restoreDraft}>
                {t('recipes.editor.restoreDraft')}
              </Button>
              <Button size="sm" variant="ghost" onClick={vm.discardDraft}>
                {t('recipes.editor.discardDraft')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={vm.mode} onValueChange={(value) => vm.switchTo(value as EditorMode)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="visual">{t('recipes.editor.visual')}</TabsTrigger>
          <TabsTrigger value="markdown">{t('recipes.editor.markdown')}</TabsTrigger>
          <TabsTrigger value="preview">{t('recipes.editor.preview')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {vm.switchError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="grid gap-2">
            <p>{t('recipes.editor.cannotSwitch')}</p>
            <DiagnosticsList diagnostics={vm.switchError} />
          </AlertDescription>
        </Alert>
      )}

      {vm.mode === 'visual' && <VisualEditor vm={vm} />}

      {vm.mode === 'markdown' && (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">{t('recipes.editor.markdownHint')}</p>
          <MarkdownEditor
            value={vm.markdown}
            onChange={vm.setMarkdown}
            errorLines={errorLines}
            label={t('recipes.editor.markdown')}
          />
          <DiagnosticsList diagnostics={vm.markdownDiagnostics} />
        </div>
      )}

      {vm.mode === 'preview' &&
        (vm.preview ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold wrap-anywhere">{vm.preview.title}</h2>
            <RecipeContent recipe={vm.preview} durationText={vm.durationText} />
          </div>
        ) : (
          <p className="text-muted-foreground">{t('recipes.editor.noPreview')}</p>
        ))}

      {vm.serverDiagnostics && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="grid gap-2">
            <p>{t('recipes.editor.invalidRecipe')}</p>
            <DiagnosticsList diagnostics={vm.serverDiagnostics} />
          </AlertDescription>
        </Alert>
      )}
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="grid gap-2">
            <p>{t(`errors.${vm.error}`, t('errors.unknown'))}</p>
            {vm.error === 'conflict' && (
              <Button
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() => void vm.reloadFromServer()}
              >
                {t('recipes.editor.reload')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button size="lg" onClick={vm.save} disabled={vm.saving}>
          {t('recipes.editor.save')}
        </Button>
        <Button size="lg" variant="ghost" onClick={vm.cancel}>
          {t('common.cancel')}
        </Button>
        {vm.dirty && (
          <span className="ml-auto text-sm text-muted-foreground">
            {t('recipes.editor.unsaved')}
          </span>
        )}
      </div>

      <AlertDialog open={vm.blocked} onOpenChange={(open) => !open && vm.stay()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recipes.editor.leaveTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('recipes.editor.leaveText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('recipes.editor.stay')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.leave}>
              {t('recipes.editor.leave')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
