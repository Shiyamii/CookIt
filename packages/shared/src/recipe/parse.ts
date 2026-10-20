import { unitIndex } from '../units/index-units';
import type { Unit } from '../units/unit';
import { parseIngredients, parseSteps } from './body';
import type { ParseResult } from './model';
import { parsePresentation } from './presentation';
import { splitParts } from './split';

export type ParseOptions = {
  /** Unit catalog (the `units` table); defaults to the built-in catalog. */
  units?: readonly Unit[];
};

/**
 * Parses a full recipe document (format of plan-site-recettes.md §4). Diagnostics of all parts are
 * returned together; the document is only returned when there is no error.
 */
export function parseRecipe(markdown: string, options: ParseOptions = {}): ParseResult {
  const split = splitParts(markdown);
  if (!split.ok) return split;

  const units = unitIndex(options.units);
  const [presentationPart, ingredientsPart, stepsPart] = split.parts;
  const presentation = parsePresentation(presentationPart);
  const ingredients = parseIngredients(ingredientsPart, units);
  const steps = parseSteps(stepsPart, units);
  const diagnostics = [
    ...split.diagnostics,
    ...presentation.diagnostics,
    ...ingredients.diagnostics,
    ...steps.diagnostics,
  ];

  if (!presentation.presentation) return { ok: false, diagnostics };
  return {
    ok: true,
    document: {
      ...presentation.presentation,
      ingredientGroups: ingredients.groups,
      stepGroups: steps.groups,
    },
    diagnostics,
  };
}
