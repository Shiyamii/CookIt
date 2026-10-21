import { z } from 'zod';
import { SUPPORTED_LOCALES } from './locale';

/**
 * Short user-visible text (label, alias): trimmed, without control or bidi override characters,
 * which could make a label display differently from what it contains.
 */
export const labelString = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    // Line and paragraph separators (U+2028, U+2029) too: a label must stay on one line.
    .refine((value) => !/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/u.test(value), {
      message: 'Control characters are not allowed',
    });

/**
 * Translated labels stored as JSONB (`{ "fr": "…", "en": "…" }`) on tag categories, tags and units.
 * Adding a language only means adding it to SUPPORTED_LOCALES: no migration.
 */
export const localizedLabelsSchema = z
  .partialRecord(z.enum(SUPPORTED_LOCALES), labelString(100))
  .refine((labels) => Object.keys(labels).length > 0, {
    message: 'At least one label is required',
  });

export type LocalizedLabels = z.infer<typeof localizedLabelsSchema>;
