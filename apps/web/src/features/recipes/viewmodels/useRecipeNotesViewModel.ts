import { RECIPE_NOTE_MAX } from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCode } from '@/lib/api';
import { RECIPES_QUERY_KEY, saveAuthorNote, saveMyNote } from '../model/recipes';

export type RecipeNotesProps = {
  recipeId: string;
  /** Share token of an unlisted recipe opened from its link. */
  token?: string;
  authorNote: string;
  myNote: string | null;
  isOwner: boolean;
  signedIn: boolean;
};

/**
 * The notes of a recipe page: the author's public note (written by the owner, read by everyone)
 * and the reader's private note (only they see it). Plain text.
 */
export function useRecipeNotesViewModel(props: RecipeNotesProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<'author' | 'mine'>();
  const [draft, setDraft] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });

  const save = useMutation({
    mutationFn: async ({ which, text }: { which: 'author' | 'mine'; text: string }) => {
      if (which === 'author') await saveAuthorNote(props.recipeId, text);
      else await saveMyNote(props.recipeId, text, props.token);
    },
    onSuccess: async () => {
      setEditing(undefined);
      await refresh();
    },
  });

  const start = (which: 'author' | 'mine') => {
    save.reset();
    setDraft(which === 'author' ? props.authorNote : (props.myNote ?? ''));
    setEditing(which);
  };

  return {
    max: RECIPE_NOTE_MAX,
    authorNote: props.authorNote,
    myNote: props.myNote,
    canEditAuthorNote: props.isOwner,
    canHaveNote: props.signedIn,
    editing,
    draft,
    setDraft,
    startAuthorNote: () => start('author'),
    startMyNote: () => start('mine'),
    cancel: () => setEditing(undefined),
    save: () => {
      if (editing) save.mutate({ which: editing, text: draft.trim() });
    },
    remove: () => {
      if (editing) save.mutate({ which: editing, text: '' });
    },
    saving: save.isPending,
    error: save.isError ? errorCode(save.error) : undefined,
  };
}
