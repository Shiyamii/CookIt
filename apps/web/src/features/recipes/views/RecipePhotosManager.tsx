import type { RecipeImage } from '@cookit/shared';
import { ChevronLeft, ChevronRight, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PictureButton } from '@/components/PictureButton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRecipePhotosViewModel } from '../viewmodels/useRecipePhotosViewModel';

/** The owner's photos of a recipe: add, delete, choose the cover, reorder. */
export function RecipePhotosManager({
  recipeId,
  images,
}: {
  recipeId: string;
  images: RecipeImage[];
}) {
  const { t } = useTranslation();
  const vm = useRecipePhotosViewModel(recipeId, images);

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <h3 className="font-medium">
          {t('recipes.photos.title')}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            {t('recipes.photos.count', { n: vm.images.length, max: vm.max })}
          </span>
        </h3>
        <p className="text-sm text-muted-foreground">{t('recipes.photos.hint')}</p>
      </div>

      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}
      {vm.skipped > 0 && (
        <Alert role="status">
          <AlertDescription>
            {t('recipes.photos.skipped', { count: vm.skipped, max: vm.max })}
          </AlertDescription>
        </Alert>
      )}

      {vm.images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {vm.images.map((image, index) => {
            const n = index + 1;
            return (
              <li key={image.id} className="grid gap-1.5" data-testid="photo">
                <img
                  src={image.thumbUrl}
                  alt={t('recipes.photos.number', { n })}
                  loading="lazy"
                  className="aspect-square w-full rounded-md bg-muted object-cover"
                />
                {index === 0 ? (
                  <Badge variant="secondary" className="h-8 w-full">
                    <Star /> {t('recipes.photos.cover')}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={vm.busy}
                    aria-label={t('recipes.photos.makeCoverOf', { n })}
                    onClick={() => vm.makeCover(image.id)}
                  >
                    <Star /> {t('recipes.photos.makeCover')}
                  </Button>
                )}
                <div className="flex justify-between">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('recipes.photos.earlier', { n })}
                    disabled={vm.busy || index === 0}
                    onClick={() => vm.move(image.id, -1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('recipes.photos.later', { n })}
                    disabled={vm.busy || index === vm.images.length - 1}
                    onClick={() => vm.move(image.id, 1)}
                  >
                    <ChevronRight />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('recipes.photos.delete', { n })}
                    disabled={vm.busy}
                    onClick={() => vm.remove(image.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {vm.progress && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('recipes.photos.uploading', { n: vm.progress.done + 1, total: vm.progress.total })}
        </p>
      )}
      {vm.canAdd && (
        <div className="justify-self-start">
          <PictureButton
            multiple
            label={t('recipes.photos.add')}
            disabled={vm.busy}
            onFiles={vm.addFiles}
          />
        </div>
      )}
    </div>
  );
}
