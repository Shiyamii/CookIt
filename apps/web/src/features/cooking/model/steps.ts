import type { DisplayRecipe, DisplaySegment } from '@/features/recipes/model/display';

/**
 * A recipe as the cooking mode walks it: steps numbered globally in order of appearance (plan §4:
 * the index kept by `currentStep`), each with its group name; ingredients numbered the same way
 * for the checkboxes.
 */

export type CookStep = {
  /** Global index (`currentStep`). */
  index: number;
  groupName?: string;
  /** Number shown (global, like on the recipe page). */
  number: number;
  segments: DisplaySegment[];
  /** Notes written between the previous step and this one. */
  notes: string[];
};

export type CookIngredientGroup = {
  name?: string;
  items: ({ kind: 'ingredient'; index: number; text: string } | { kind: 'text'; text: string })[];
};

export function cookSteps(recipe: DisplayRecipe): CookStep[] {
  const steps: CookStep[] = [];
  let notes: string[] = [];
  for (const group of recipe.stepGroups) {
    for (const item of group.items) {
      if (item.kind === 'text') {
        notes.push(item.text);
        continue;
      }
      steps.push({
        index: steps.length,
        groupName: group.name || undefined,
        number: item.number,
        segments: item.segments,
        notes,
      });
      notes = [];
    }
  }
  // Notes after the last step stay visible with it.
  const last = steps[steps.length - 1];
  if (last && notes.length) steps[steps.length - 1] = { ...last, notes: [...last.notes, ...notes] };
  return steps;
}

export function cookIngredients(recipe: DisplayRecipe): CookIngredientGroup[] {
  let index = 0;
  return recipe.ingredientGroups.map((group) => ({
    name: group.name || undefined,
    items: group.items.map((item) =>
      item.kind === 'ingredient'
        ? { kind: 'ingredient' as const, index: index++, text: item.text }
        : { kind: 'text' as const, text: item.text },
    ),
  }));
}
