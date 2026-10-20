import { createDiagnostics, type Diagnostic } from './diagnostics';
import type { IngredientGroup, RecipeDocument, StepGroup, StepItem } from './model';

/**
 * Checks that a translation has the same structure as the base recipe, so that a cooking session
 * stays valid when the language changes: servings, number of groups, items per group, steps per
 * group and timer durations of each step. Group names and texts may differ. Only warnings: the
 * translation can be saved anyway, but switching language while cooking requires no diagnostic.
 */
export function checkTranslationStructure(
  base: RecipeDocument,
  translation: RecipeDocument,
): Diagnostic[] {
  const diagnostics = createDiagnostics();
  const mismatch = (
    code: Extract<Diagnostic['code'], `translation_${string}`>,
    params: Record<string, string | number>,
  ) => diagnostics.warning({ code, params });

  if (base.servings !== translation.servings) {
    mismatch('translation_servings', { expected: base.servings, found: translation.servings });
  }

  const parts = [
    ['ingredients', structural(base.ingredientGroups), structural(translation.ingredientGroups)],
    ['steps', structural(base.stepGroups), structural(translation.stepGroups)],
  ] as const;
  for (const [part, baseGroups, translatedGroups] of parts) {
    if (baseGroups.length !== translatedGroups.length) {
      mismatch('translation_group_count', {
        part,
        expected: baseGroups.length,
        found: translatedGroups.length,
      });
      continue;
    }
    baseGroups.forEach((group, i) => {
      const expected = group.items.filter((item) => item.kind !== 'text').length;
      const found = translatedGroups[i]?.items.filter((item) => item.kind !== 'text').length ?? 0;
      if (expected !== found) {
        mismatch('translation_item_count', { part, group: i + 1, expected, found });
      }
    });
  }

  const baseSteps = steps(base);
  const translatedSteps = steps(translation);
  baseSteps.forEach((step, i) => {
    const other = translatedSteps[i];
    if (!other) return;
    const expected = timers(step);
    const found = timers(other);
    if (expected !== found) {
      mismatch('translation_timers', { step: step.index + 1, expected, found });
    }
  });

  return diagnostics.result();
}

/** Groups that count for the structure: a leading group without heading made only of text (a note
 * before the first `###`) is not one. */
function structural<G extends IngredientGroup | StepGroup>(groups: G[]): G[] {
  const [first, ...rest] = groups;
  const textOnly = first?.items.every((item) => item.kind === 'text');
  return first && first.name === undefined && textOnly ? rest : groups;
}

function steps(document: RecipeDocument): StepItem[] {
  return document.stepGroups.flatMap((group) =>
    group.items.filter((item): item is StepItem => item.kind === 'step'),
  );
}

/** Timer durations of a step, in order, as text (`600, 90`). */
function timers(step: StepItem): string {
  return step.segments
    .flatMap((segment) => (segment.kind === 'timer' ? [segment.seconds] : []))
    .join(', ');
}
