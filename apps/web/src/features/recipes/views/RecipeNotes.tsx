import { Lock, MessageSquareQuote, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useRecipeNotesViewModel,
  type RecipeNotesProps,
} from '../viewmodels/useRecipeNotesViewModel';

type Vm = ReturnType<typeof useRecipeNotesViewModel>;

/** The author's public note and the reader's private note, on a recipe page. */
export function RecipeNotes(props: RecipeNotesProps) {
  const { t } = useTranslation();
  const vm = useRecipeNotesViewModel(props);
  const showAuthor = vm.authorNote !== '' || vm.canEditAuthorNote;
  if (!showAuthor && !vm.canHaveNote) return null;

  return (
    <div className="grid gap-4">
      {showAuthor && (
        <section
          aria-labelledby="author-note-title"
          className="grid gap-2 rounded-lg border bg-card p-4"
        >
          <h2 id="author-note-title" className="flex items-center gap-2 font-semibold">
            <MessageSquareQuote className="size-4" aria-hidden /> {t('recipes.notes.author')}
          </h2>
          {vm.editing === 'author' ? (
            <NoteForm vm={vm} id="author-note" label={t('recipes.notes.author')} />
          ) : (
            <>
              {vm.authorNote ? (
                <p className="whitespace-pre-line wrap-anywhere">{vm.authorNote}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('recipes.notes.authorEmpty')}</p>
              )}
              {vm.canEditAuthorNote && (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  onClick={vm.startAuthorNote}
                >
                  {vm.authorNote ? <Pencil /> : <Plus />}
                  {vm.authorNote ? t('recipes.notes.edit') : t('recipes.notes.addAuthor')}
                </Button>
              )}
            </>
          )}
        </section>
      )}

      {vm.canHaveNote && (
        <section
          aria-labelledby="my-note-title"
          className="grid gap-2 rounded-lg border border-dashed p-4"
        >
          <h2 id="my-note-title" className="flex items-center gap-2 font-semibold">
            <Lock className="size-4" aria-hidden /> {t('recipes.notes.mine')}
          </h2>
          {vm.editing === 'mine' ? (
            <NoteForm vm={vm} id="my-note" label={t('recipes.notes.mine')} />
          ) : (
            <>
              {vm.myNote ? (
                <p className="whitespace-pre-line wrap-anywhere">{vm.myNote}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('recipes.notes.mineEmpty')}</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={vm.startMyNote}
              >
                {vm.myNote ? <Pencil /> : <Plus />}
                {vm.myNote ? t('recipes.notes.edit') : t('recipes.notes.addMine')}
              </Button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function NoteForm({ vm, id, label }: { vm: Vm; id: string; label: string }) {
  const { t } = useTranslation();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        vm.save();
      }}
    >
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Textarea
        id={id}
        rows={4}
        maxLength={vm.max}
        autoFocus
        value={vm.draft}
        onChange={(event) => vm.setDraft(event.target.value)}
      />
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={vm.saving}>
          {t('recipes.notes.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={vm.cancel}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={vm.remove}
          disabled={vm.saving}
        >
          {t('recipes.notes.delete')}
        </Button>
      </div>
    </form>
  );
}
