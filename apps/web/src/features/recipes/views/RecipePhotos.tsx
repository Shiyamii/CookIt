import type { RecipeImage } from '@cookit/shared';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * A recipe's photos: the cover, then thumbnails of the others. A tap opens a photo full size,
 * with previous / next.
 */
export function RecipePhotos({ images, title }: { images: RecipeImage[]; title: string }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState<number>();
  if (images.length === 0) return null;
  const [cover, ...others] = images as [RecipeImage, ...RecipeImage[]];
  const count = images.length;
  const current = shown === undefined ? undefined : images[shown];
  const label = (n: number) => t('recipes.photos.open', { n, total: count, title });

  return (
    <div className="grid gap-2">
      <button
        type="button"
        className="overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={label(1)}
        onClick={() => setShown(0)}
      >
        <img
          src={cover.url}
          alt=""
          className="aspect-[4/3] w-full bg-muted object-cover sm:aspect-[16/9]"
        />
      </button>
      {others.length > 0 && (
        <ul className="grid grid-cols-5 gap-2">
          {others.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                className="block w-full overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={label(index + 2)}
                onClick={() => setShown(index + 1)}
              >
                <img
                  src={image.thumbUrl}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full bg-muted object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={current !== undefined} onOpenChange={(open) => !open && setShown(undefined)}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="grid max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-3xl"
        >
          <DialogTitle className="text-base">
            {t('recipes.photos.viewer', { n: (shown ?? 0) + 1, total: count, title })}
          </DialogTitle>
          {current && (
            <img
              src={current.url}
              alt=""
              className="max-h-[70dvh] w-full rounded-md bg-muted object-contain"
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label={t('recipes.photos.previous')}
                disabled={!shown}
                onClick={() => setShown((value) => Math.max(0, (value ?? 0) - 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('recipes.photos.next')}
                disabled={shown === undefined || shown >= count - 1}
                onClick={() => setShown((value) => Math.min(count - 1, (value ?? 0) + 1))}
              >
                <ChevronRight />
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setShown(undefined)}>
              <X /> {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
