import {
  detectDurations,
  splitIngredients,
  splitSteps,
  timerLink,
  type DetectedDuration,
  type Locale,
  type PastedGroup,
} from '@cookit/shared';
import { newId, toBody, type EditorGroup, type EditorRecipe } from './editor';

/**
 * The creation wizard (plan §5.2): information, ingredients (pasted then corrected), steps
 * (pasted, with the durations found proposed as timers), preview. Any screen can be skipped.
 */

export type WizardDuration = DetectedDuration & {
  /** Accepted as a timer (a tap toggles it). For a range, which value. */
  accepted: boolean;
  useLow: boolean;
};

export type WizardStep = { id: string; text: string; durations: WizardDuration[] };
export type WizardStepGroup = { id: string; name?: string; steps: WizardStep[] };
export type WizardIngredientGroup = {
  id: string;
  name?: string;
  lines: { id: string; text: string }[];
};

export type WizardState = {
  title: string;
  servings: string;
  description: string;
  source: string;
  ingredients: WizardIngredientGroup[];
  steps: WizardStepGroup[];
};

export function emptyWizard(): WizardState {
  return { title: '', servings: '4', description: '', source: '', ingredients: [], steps: [] };
}

export function ingredientsFromPaste(text: string): WizardIngredientGroup[] {
  return splitIngredients(text).map((group: PastedGroup) => ({
    id: newId(),
    name: group.name,
    lines: group.items.map((item) => ({ id: newId(), text: item })),
  }));
}

/** Durations found in a step, all proposed (the user refuses those that are not timers). */
export function stepOf(text: string): WizardStep {
  return {
    id: newId(),
    text,
    durations: detectDurations(text).map((d) => ({ ...d, accepted: true, useLow: false })),
  };
}

export function stepsFromPaste(text: string): WizardStepGroup[] {
  return splitSteps(text).map((group) => ({
    id: newId(),
    name: group.name,
    steps: group.items.map(stepOf),
  }));
}

/** The step text with its accepted durations written as timers (from the end: positions hold). */
export function stepWithTimers(step: WizardStep): string {
  let text = step.text;
  const accepted = step.durations.filter((d) => d.accepted).sort((a, b) => b.start - a.start);
  for (const duration of accepted) {
    const seconds = duration.useLow && duration.lowSeconds ? duration.lowSeconds : duration.seconds;
    text =
      text.slice(0, duration.start) + timerLink(duration.text, seconds) + text.slice(duration.end);
  }
  return text;
}

const row = (raw: string) => ({ id: newId(), kind: 'item' as const, raw });

/** The wizard's recipe as the editor model (then the canonical body). */
export function wizardRecipe(state: WizardState): EditorRecipe {
  const ingredientGroups: EditorGroup[] = state.ingredients.map((group) => ({
    id: group.id,
    name: group.name,
    rows: group.lines.map((line) => row(line.text)),
  }));
  const stepGroups: EditorGroup[] = state.steps.map((group) => ({
    id: group.id,
    name: group.name,
    rows: group.steps.map((step) => row(stepWithTimers(step))),
  }));
  return {
    title: state.title,
    description: state.description,
    summary: '',
    servings: state.servings,
    source: state.source,
    extraMeta: [],
    ingredientGroups: ingredientGroups.length
      ? ingredientGroups
      : [{ id: newId(), name: undefined, rows: [] }],
    stepGroups: stepGroups.length ? stepGroups : [{ id: newId(), name: undefined, rows: [] }],
  };
}

export function wizardBody(state: WizardState, locale: Locale): string {
  return toBody(wizardRecipe(state), locale);
}
