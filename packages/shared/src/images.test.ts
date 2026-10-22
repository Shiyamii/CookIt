import { describe, expect, test } from 'bun:test';
import {
  IMAGE_LIMITS,
  MAX_RECIPE_IMAGES,
  avatarUploadSchema,
  avatarUrl,
  fitWithin,
  recipeImageOrderInputSchema,
  recipeImageUploadSchema,
  recipeImageUrls,
} from './images';

const blob = (size: number) => new Blob([new Uint8Array(size)]);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('fitWithin', () => {
  test('never upscales a small picture', () => {
    expect(fitWithin(100, 50, 1600)).toEqual({ width: 100, height: 50 });
  });

  test('keeps a picture exactly at the limit', () => {
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });

  test('scales on the longest side, landscape and portrait', () => {
    expect(fitWithin(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 });
  });

  test('rounds to the nearest pixel', () => {
    // 4000 x 3001 -> scale 0.4 -> 1600 x 1200.4
    expect(fitWithin(4000, 3001, 1600)).toEqual({ width: 1600, height: 1200 });
    // 4000 x 3003 -> 1201.2 ; 4000 x 3004 -> 1201.6
    expect(fitWithin(4000, 3004, 1600)).toEqual({ width: 1600, height: 1202 });
  });

  test('a very thin picture keeps at least one pixel', () => {
    expect(fitWithin(10_000, 1, 480)).toEqual({ width: 480, height: 1 });
    expect(fitWithin(1, 10_000, 480)).toEqual({ width: 1, height: 480 });
  });

  test('square picture', () => {
    expect(fitWithin(1000, 1000, 256)).toEqual({ width: 256, height: 256 });
  });
});

describe('image urls', () => {
  test('recipe image and avatar urls', () => {
    expect(recipeImageUrls('abc')).toEqual({
      id: 'abc',
      url: '/images/recipes/abc',
      thumbUrl: '/images/recipes/abc/thumb',
    });
    expect(avatarUrl('u1')).toBe('/images/avatars/u1');
  });
});

describe('recipeImageOrderInputSchema', () => {
  test('accepts 1 to the maximum number of ids', () => {
    expect(recipeImageOrderInputSchema.safeParse({ ids: [uuid(1)] }).success).toBe(true);
    const six = Array.from({ length: MAX_RECIPE_IMAGES }, (_, i) => uuid(i + 1));
    expect(recipeImageOrderInputSchema.safeParse({ ids: six }).success).toBe(true);
  });

  test('refuses an empty list, too many ids, non-uuid ids', () => {
    expect(recipeImageOrderInputSchema.safeParse({ ids: [] }).success).toBe(false);
    const seven = Array.from({ length: MAX_RECIPE_IMAGES + 1 }, (_, i) => uuid(i + 1));
    expect(recipeImageOrderInputSchema.safeParse({ ids: seven }).success).toBe(false);
    expect(recipeImageOrderInputSchema.safeParse({ ids: ['nope'] }).success).toBe(false);
    expect(recipeImageOrderInputSchema.safeParse({ ids: [1] }).success).toBe(false);
  });

  test('refuses a missing list and unknown keys', () => {
    expect(recipeImageOrderInputSchema.safeParse({}).success).toBe(false);
    expect(recipeImageOrderInputSchema.safeParse({ ids: [uuid(1)], extra: 1 }).success).toBe(false);
  });
});

describe('recipeImageUploadSchema', () => {
  test('accepts files at exactly the limits', () => {
    const input = {
      image: blob(IMAGE_LIMITS.full.maxBytes),
      thumb: blob(IMAGE_LIMITS.thumb.maxBytes),
    };
    expect(recipeImageUploadSchema.safeParse(input).success).toBe(true);
  });

  test('refuses a picture or a thumbnail one byte over', () => {
    expect(
      recipeImageUploadSchema.safeParse({
        image: blob(IMAGE_LIMITS.full.maxBytes + 1),
        thumb: blob(10),
      }).success,
    ).toBe(false);
    expect(
      recipeImageUploadSchema.safeParse({
        image: blob(10),
        thumb: blob(IMAGE_LIMITS.thumb.maxBytes + 1),
      }).success,
    ).toBe(false);
  });

  test('refuses missing parts, text fields and unknown keys', () => {
    expect(recipeImageUploadSchema.safeParse({ image: blob(10) }).success).toBe(false);
    expect(recipeImageUploadSchema.safeParse({ thumb: blob(10) }).success).toBe(false);
    expect(recipeImageUploadSchema.safeParse({ image: 'text', thumb: blob(10) }).success).toBe(
      false,
    );
    expect(
      recipeImageUploadSchema.safeParse({ image: blob(10), thumb: blob(10), more: blob(1) })
        .success,
    ).toBe(false);
  });
});

describe('avatarUploadSchema', () => {
  test('accepts a file up to the limit, refuses one byte over', () => {
    expect(
      avatarUploadSchema.safeParse({ image: blob(IMAGE_LIMITS.avatar.maxBytes) }).success,
    ).toBe(true);
    expect(
      avatarUploadSchema.safeParse({ image: blob(IMAGE_LIMITS.avatar.maxBytes + 1) }).success,
    ).toBe(false);
  });

  test('refuses a missing or non-file image and unknown keys', () => {
    expect(avatarUploadSchema.safeParse({}).success).toBe(false);
    expect(avatarUploadSchema.safeParse({ image: 'x' }).success).toBe(false);
    expect(avatarUploadSchema.safeParse({ image: blob(1), thumb: blob(1) }).success).toBe(false);
  });
});
