import { z } from 'zod';

// Images (phase 9c): recipe photos (the first one is the cover) and profile pictures. The browser
// resizes and re-encodes every picture before sending it (WebP, JPEG where the browser cannot
// write WebP), which also drops its metadata (EXIF, GPS position). The server stores the bytes
// in Postgres and only checks their header: type and dimensions.

export const IMAGE_TYPES = ['image/webp', 'image/jpeg'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** Longest side (pixels) and largest file the server accepts for each kind of picture. */
export const IMAGE_LIMITS = {
  /** Recipe photo as shown on the recipe page. */
  full: { maxSide: 1600, maxBytes: 700_000 },
  /** Its thumbnail, for lists and the gallery strip. */
  thumb: { maxSide: 480, maxBytes: 120_000 },
  /** Profile picture. */
  avatar: { maxSide: 256, maxBytes: 100_000 },
} as const;
export type ImageKind = keyof typeof IMAGE_LIMITS;

/** Photos per recipe (the first one is the cover). */
export const MAX_RECIPE_IMAGES = 6;

/**
 * Photo storage per user (pictures and thumbnails of all their recipes, copies included): about
 * 600 photos. Keeps one account from filling the database.
 */
export const MAX_IMAGE_BYTES_PER_USER = 500 * 1024 * 1024;

/** Largest picture the browser is asked to read before resizing (a phone photo is ~5–15 MB). */
export const MAX_IMAGE_SOURCE_BYTES = 30 * 1024 * 1024;

/** A recipe photo: the full picture and its thumbnail. */
export type RecipeImage = { id: string; url: string; thumbUrl: string };

export const recipeImageUrls = (id: string): RecipeImage => ({
  id,
  url: `/images/recipes/${id}`,
  thumbUrl: `/images/recipes/${id}/thumb`,
});

export const avatarUrl = (id: string) => `/images/avatars/${id}`;

/** New order of a recipe's photos: every one of them, the cover first. */
export const recipeImageOrderInputSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(MAX_RECIPE_IMAGES) })
  .strict();

export const IMAGE_ERRORS = ['invalid_image', 'too_many_images', 'storage_full'] as const;

/** Dimensions of a `width` × `height` picture fitting in a `maxSide` square, ratio kept. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Upload of a recipe photo (multipart form): the picture and its thumbnail. */
export const recipeImageUploadSchema = z
  .object({
    image: z.instanceof(Blob).refine((file) => file.size <= IMAGE_LIMITS.full.maxBytes),
    thumb: z.instanceof(Blob).refine((file) => file.size <= IMAGE_LIMITS.thumb.maxBytes),
  })
  .strict();

/** Upload of a profile picture (multipart form). */
export const avatarUploadSchema = z
  .object({
    image: z.instanceof(Blob).refine((file) => file.size <= IMAGE_LIMITS.avatar.maxBytes),
  })
  .strict();
