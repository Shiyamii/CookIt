import { describe, expect, test } from 'bun:test';
import { parseRecipe } from '@cookit/shared';
import {
  emptyWizard,
  ingredientsFromPaste,
  stepOf,
  stepsFromPaste,
  stepWithTimers,
  wizardBody,
  wizardRecipe,
  type WizardState,
} from './wizard';

describe('stepOf / stepWithTimers', () => {
  test('all durations are proposed and accepted by default', () => {
    const step = stepOf('Cuire 10 min puis reposer 1h30.');
    expect(step.durations.map((d) => [d.seconds, d.accepted, d.useLow])).toEqual([
      [600, true, false],
      [5400, true, false],
    ]);
    expect(stepWithTimers(step)).toBe(
      'Cuire [10 min](timer:10m) puis reposer [1h30](timer:1h30m).',
    );
  });

  test('a refused duration stays plain text', () => {
    const step = stepOf('Cuire 10 min puis reposer 1h30.');
    const [first, second] = step.durations;
    if (!first || !second) throw new Error('durations expected');
    first.accepted = false;
    expect(stepWithTimers(step)).toBe('Cuire 10 min puis reposer [1h30](timer:1h30m).');
    second.accepted = false;
    expect(stepWithTimers(step)).toBe('Cuire 10 min puis reposer 1h30.');
  });

  test('a range uses its high value, or the low one with useLow', () => {
    const step = stepOf('Cuire 2 à 3 minutes.');
    expect(stepWithTimers(step)).toBe('Cuire [2 à 3 minutes](timer:3m).');
    const [range] = step.durations;
    if (!range) throw new Error('duration expected');
    range.useLow = true;
    expect(stepWithTimers(step)).toBe('Cuire [2 à 3 minutes](timer:2m).');
  });

  test('useLow on a duration without low value keeps the single value', () => {
    const step = stepOf('Cuire 5 min.');
    const [single] = step.durations;
    if (!single) throw new Error('duration expected');
    single.useLow = true;
    expect(stepWithTimers(step)).toBe('Cuire [5 min](timer:5m).');
  });

  test('a step without duration is unchanged', () => {
    expect(stepWithTimers(stepOf('Mélanger bien.'))).toBe('Mélanger bien.');
    expect(stepWithTimers(stepOf(''))).toBe('');
  });

  test('every accepted timer produces a valid recipe', () => {
    const state: WizardState = {
      ...emptyWizard(),
      title: 'Test',
      steps: stepsFromPaste('1. Cuire 2 à 3 min.\n2. Reposer 1 h.\n3. Servir.'),
    };
    const parsed = parseRecipe(`# Test\n\nportions: 4\n\n---\n\n${wizardBody(state, 'fr')}`);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});

describe('wizardRecipe / wizardBody', () => {
  test('groups and names are kept, timers written in the steps', () => {
    const state: WizardState = {
      ...emptyWizard(),
      title: 'Tarte',
      ingredients: ingredientsFromPaste('Pâte :\n200 g de farine\nGarniture :\n3 pommes'),
      steps: stepsFromPaste('### Pâte\nMélanger 2 min.\n### Cuisson\nCuire 30 min.'),
    };
    const recipe = wizardRecipe(state);
    expect(recipe.ingredientGroups.map((g) => [g.name, g.rows.map((r) => r.raw)])).toEqual([
      ['Pâte', ['200 g de farine']],
      ['Garniture', ['3 pommes']],
    ]);
    expect(recipe.stepGroups.map((g) => [g.name, g.rows.map((r) => r.raw)])).toEqual([
      ['Pâte', ['Mélanger [2 min](timer:2m).']],
      ['Cuisson', ['Cuire [30 min](timer:30m).']],
    ]);
    const body = wizardBody(state, 'fr');
    expect(body).toContain('### Pâte');
    expect(body).toContain('[30 min](timer:30m)');
  });

  test('skipped screens give one empty group each, and a body that is still valid', () => {
    const recipe = wizardRecipe({ ...emptyWizard(), title: 'Vide' });
    expect(recipe.ingredientGroups).toHaveLength(1);
    expect(recipe.stepGroups).toHaveLength(1);
    expect(recipe.ingredientGroups[0]?.rows).toEqual([]);
    const body = wizardBody({ ...emptyWizard(), title: 'Vide' }, 'fr');
    const parsed = parseRecipe(`# Vide\n\nportions: 4\n\n---\n\n${body}`);
    expect(parsed.ok).toBe(true);
  });

  test('information fields are copied', () => {
    const recipe = wizardRecipe({
      ...emptyWizard(),
      title: 'T',
      servings: '6',
      description: 'D',
      source: 'https://e.com',
    });
    expect(recipe).toMatchObject({
      title: 'T',
      servings: '6',
      description: 'D',
      source: 'https://e.com',
      extraMeta: [],
    });
  });

  test('blank pasted lines are dropped from the body', () => {
    const state: WizardState = {
      ...emptyWizard(),
      ingredients: [{ id: 'g', lines: [{ id: 'a', text: '  ' }] }],
    };
    expect(wizardBody(state, 'en')).not.toContain('- ');
  });
});

describe('pasting', () => {
  test('empty pastes give no groups', () => {
    expect(ingredientsFromPaste('')).toEqual([]);
    expect(stepsFromPaste('  \n ')).toEqual([]);
  });
  test('ids are unique', () => {
    const groups = ingredientsFromPaste('a\nb\nc');
    const ids = groups.flatMap((g) => [g.id, ...g.lines.map((l) => l.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
