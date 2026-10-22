import {
  fitWithin,
  IMAGE_LIMITS,
  MAX_IMAGE_SOURCE_BYTES,
  type ImageKind,
  type ImageType,
} from '@cookit/shared';

/** A picture that could not be prepared, as an error code for `t('errors.<code>')`. */
export class ImageError extends Error {
  constructor(readonly code: 'image_unreadable' | 'image_too_big') {
    super(code);
  }
}

const QUALITIES = [0.82, 0.7, 0.55];

function toBlob(canvas: HTMLCanvasElement, type: ImageType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Draws the picture at the size of `kind` (a centered square when `square`) and encodes it,
 * lowering the quality, then the size, until it fits the server's limit. WebP when the browser
 * can write it (it silently writes PNG otherwise), else JPEG; `type` forces the one of a
 * picture already encoded (a thumbnail has the type of its photo).
 */
async function encode(
  bitmap: ImageBitmap,
  kind: ImageKind,
  options: { square?: boolean; type?: ImageType } = {},
): Promise<Blob> {
  const { maxSide, maxBytes } = IMAGE_LIMITS[kind];
  const side = Math.min(bitmap.width, bitmap.height);
  const source = options.square
    ? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, width: side, height: side }
    : { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  let limit: number = maxSide;
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = fitWithin(source.width, source.height, limit);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new ImageError('image_unreadable');
    // Transparent parts would turn black in a JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      size.width,
      size.height,
    );
    for (const quality of QUALITIES) {
      let blob = options.type === 'image/jpeg' ? null : await toBlob(canvas, 'image/webp', quality);
      if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= maxBytes) return blob;
    }
    limit = Math.round(limit * 0.75);
  }
  throw new ImageError('image_too_big');
}

/**
 * Reads a picture chosen by the user. Decoding applies its EXIF orientation; re-encoding drops
 * its metadata (camera, GPS position).
 */
async function decode(file: Blob): Promise<ImageBitmap> {
  if (file.size > MAX_IMAGE_SOURCE_BYTES) throw new ImageError('image_too_big');
  try {
    return await createImageBitmap(file);
  } catch {
    throw new ImageError('image_unreadable');
  }
}

/** A recipe photo and its thumbnail, ready to upload. */
export async function preparePhoto(file: Blob): Promise<{ image: Blob; thumb: Blob }> {
  const bitmap = await decode(file);
  try {
    const image = await encode(bitmap, 'full');
    const thumb = await encode(bitmap, 'thumb', { type: image.type as ImageType });
    return { image, thumb };
  } finally {
    bitmap.close();
  }
}

/** A profile picture: the centered square of the picture, small. */
export async function prepareAvatar(file: Blob): Promise<Blob> {
  const bitmap = await decode(file);
  try {
    return await encode(bitmap, 'avatar', { square: true });
  } finally {
    bitmap.close();
  }
}
