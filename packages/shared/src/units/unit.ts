import { z } from 'zod';
import { labelString, localizedLabelsSchema } from '../labels';
import { SUPPORTED_LOCALES } from '../locale';
import { normalizeAlias } from './normalize';

/** How a scaled quantity is rounded: metric units in decimals, cooking units in fractions. */
export const UNIT_ROUNDINGS = ['decimal', 'fraction'] as const;
export type UnitRounding = (typeof UNIT_ROUNDINGS)[number];

/**
 * A unit of the catalog (table `units`, edited by the admin). Aliases are every way of writing
 * the unit, per language: `{ "fr": ["c. à soupe", "CaS"], "en": ["tbsp"] }`. They are matched
 * in any language, ignoring case, accents, dots and spaces.
 */
export const unitSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  rounding: z.enum(UNIT_ROUNDINGS),
  labels: localizedLabelsSchema,
  aliases: z.partialRecord(
    z.enum(SUPPORTED_LOCALES),
    z
      .array(
        // `.` or `. .` would normalize to an empty key that matches nothing (or everything).
        labelString(50).refine((alias) => normalizeAlias(alias).length > 0, {
          message: 'An alias needs at least one letter or digit',
        }),
      )
      .max(50),
  ),
});

export type Unit = z.infer<typeof unitSchema>;
