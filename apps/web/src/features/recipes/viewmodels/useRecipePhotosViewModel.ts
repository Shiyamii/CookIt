import { MAX_RECIPE_IMAGES, type RecipeImage } from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCode } from '@/lib/api';
import { ImageError } from '@/lib/images';
import { filesThatFit, makeCover, moveImage } from '../model/photos';
import {
  deleteRecipeImage,
  orderRecipeImages,
  RECIPES_QUERY_KEY,
  uploadRecipeImage,
} from '../model/recipes';

const failure = (error: unknown) => (error instanceof ImageError ? error.code : errorCode(error));

/**
 * The owner's photo management on a recipe page: add (up to six, one upload at a time), delete,
 * make the cover, move. Every change is saved at once (photos are not part of the editors).
 */
export function useRecipePhotosViewModel(recipeId: string, images: readonly RecipeImage[]) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [skipped, setSkipped] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const ids = images.map((image) => image.id);

  const refresh = () => queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      // One at a time: each one is resized in the browser first, and the server counts them.
      for (const [index, file] of files.entries()) {
        setProgress({ done: index, total: files.length });
        await uploadRecipeImage(recipeId, file);
      }
    },
    onMutate: () => setError(undefined),
    onError: (failed) => setError(failure(failed)),
    onSettled: async () => {
      setProgress(undefined);
      await refresh();
    },
  });

  const change = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    onMutate: () => {
      setError(undefined);
      setSkipped(0);
    },
    onError: (failed) => setError(failure(failed)),
    onSettled: refresh,
  });

  return {
    images,
    canAdd: images.length < MAX_RECIPE_IMAGES,
    max: MAX_RECIPE_IMAGES,
    busy: upload.isPending || change.isPending,
    progress,
    error,
    /** Chosen files beyond the six places, left out. */
    skipped,
    addFiles: (files: File[]) => {
      const fit = filesThatFit(files, images.length);
      setSkipped(fit.left);
      if (fit.files.length) upload.mutate(fit.files);
    },
    remove: (imageId: string) => change.mutate(() => deleteRecipeImage(recipeId, imageId)),
    makeCover: (imageId: string) =>
      change.mutate(() => orderRecipeImages(recipeId, makeCover(ids, imageId))),
    move: (imageId: string, delta: -1 | 1) =>
      change.mutate(() => orderRecipeImages(recipeId, moveImage(ids, imageId, delta))),
  };
}
