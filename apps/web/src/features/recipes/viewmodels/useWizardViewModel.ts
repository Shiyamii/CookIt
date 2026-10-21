import { isLocale, parseRecipe, type Locale } from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorCode } from '@/lib/api';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { useUnitCatalog } from '@/features/catalog/viewmodels/useCatalogs';
import { displayRecipe, durationText } from '../model/display';
import { clearDraft, draftKey, loadJsonDraft, saveJsonDraft } from '../model/draft';
import { newId, toFields, toMarkdown, type InvalidField } from '../model/editor';
import { createRecipe, RECIPES_QUERY_KEY } from '../model/recipes';
import {
  emptyWizard,
  ingredientsFromPaste,
  stepOf,
  stepsFromPaste,
  wizardBody,
  wizardRecipe,
  type WizardState,
} from '../model/wizard';

export const WIZARD_SCREENS = ['info', 'ingredients', 'steps', 'preview'] as const;
export type WizardScreen = (typeof WIZARD_SCREENS)[number];

type Draft = { state: WizardState; lang: Locale; screen: number };

/**
 * The step-by-step creation wizard (plan §5.2), made for phones: information, ingredients pasted
 * in bulk then corrected line by line, steps pasted with their durations proposed as timers,
 * then a preview. Screens can be skipped; the draft is kept in the browser.
 */
export function useWizardViewModel() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const key = draftKey(user?.id ?? '', 'wizard');
  const { units } = useUnitCatalog();

  const [restored] = useState(() => loadJsonDraft<Draft>(key));
  const [state, setState] = useState<WizardState>(restored?.state ?? emptyWizard());
  const [lang, setLang] = useState<Locale>(
    restored?.lang ?? (isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr'),
  );
  const [screen, setScreen] = useState(restored?.screen ?? 0);
  const [pastedIngredients, setPastedIngredients] = useState('');
  const [pastedSteps, setPastedSteps] = useState('');
  const [invalid, setInvalid] = useState<InvalidField[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => saveJsonDraft(key, { state, lang, screen }), 500);
    return () => clearTimeout(timer);
  }, [key, state, lang, screen]);

  const update = (change: (current: WizardState) => WizardState) => setState(change);

  const create = useMutation({
    mutationFn: async () => {
      const fields = toFields(wizardRecipe(state));
      if (!fields.ok) throw new Error('invalid_fields');
      return createRecipe({ ...fields.fields, body: wizardBody(state, lang), lang });
    },
    onSuccess: async ({ id }) => {
      clearDraft(key);
      await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      await navigate(`/recipes/${id}`, { replace: true });
    },
  });

  const preview = useMemo(() => {
    if (WIZARD_SCREENS[screen] !== 'preview') return undefined;
    const result = parseRecipe(toMarkdown(wizardRecipe(state), lang), { units });
    return result.ok
      ? displayRecipe(result.document, result.document.servings, lang, units)
      : undefined;
  }, [screen, state, lang, units]);

  return {
    screen: WIZARD_SCREENS[screen] ?? 'info',
    screenIndex: screen,
    screenCount: WIZARD_SCREENS.length,
    goTo: (index: number) => setScreen(Math.max(0, Math.min(WIZARD_SCREENS.length - 1, index))),
    state,
    lang,
    setLang,
    setField: (field: 'title' | 'servings' | 'description' | 'source', value: string) =>
      update((s) => ({ ...s, [field]: value })),
    invalid,

    // Ingredients: paste, then correct each line.
    pastedIngredients,
    setPastedIngredients,
    splitIngredients: () => {
      const groups = ingredientsFromPaste(pastedIngredients);
      if (groups.length) update((s) => ({ ...s, ingredients: [...s.ingredients, ...groups] }));
      setPastedIngredients('');
    },
    setIngredient: (groupId: string, lineId: string, text: string) =>
      update((s) => ({
        ...s,
        ingredients: s.ingredients.map((g) =>
          g.id === groupId
            ? { ...g, lines: g.lines.map((l) => (l.id === lineId ? { ...l, text } : l)) }
            : g,
        ),
      })),
    addIngredient: (groupId?: string) =>
      update((s) => {
        const groups = s.ingredients.length ? s.ingredients : [{ id: newId(), lines: [] }];
        const target = groupId ?? groups[groups.length - 1]?.id;
        return {
          ...s,
          ingredients: groups.map((g) =>
            g.id === target ? { ...g, lines: [...g.lines, { id: newId(), text: '' }] } : g,
          ),
        };
      }),
    removeIngredient: (groupId: string, lineId: string) =>
      update((s) => ({
        ...s,
        ingredients: s.ingredients
          .map((g) =>
            g.id === groupId ? { ...g, lines: g.lines.filter((l) => l.id !== lineId) } : g,
          )
          .filter((g) => g.lines.length > 0 || g.name),
      })),

    // Steps: paste, then accept or refuse the timers found.
    pastedSteps,
    setPastedSteps,
    splitSteps: () => {
      const groups = stepsFromPaste(pastedSteps);
      if (groups.length) update((s) => ({ ...s, steps: [...s.steps, ...groups] }));
      setPastedSteps('');
    },
    setStep: (groupId: string, stepId: string, text: string) =>
      update((s) => ({
        ...s,
        steps: s.steps.map((g) =>
          g.id === groupId
            ? {
                ...g,
                // The text changed: durations are looked for again.
                steps: g.steps.map((step) =>
                  step.id === stepId ? { ...stepOf(text), id: step.id } : step,
                ),
              }
            : g,
        ),
      })),
    removeStep: (groupId: string, stepId: string) =>
      update((s) => ({
        ...s,
        steps: s.steps
          .map((g) =>
            g.id === groupId ? { ...g, steps: g.steps.filter((st) => st.id !== stepId) } : g,
          )
          .filter((g) => g.steps.length > 0 || g.name),
      })),
    /** One tap accepts or refuses a proposed timer; for a range, `useLow` picks the low value. */
    setTimer: (groupId: string, stepId: string, index: number, accepted: boolean, useLow = false) =>
      update((s) => ({
        ...s,
        steps: s.steps.map((g) =>
          g.id !== groupId
            ? g
            : {
                ...g,
                steps: g.steps.map((step) =>
                  step.id !== stepId
                    ? step
                    : {
                        ...step,
                        durations: step.durations.map((d, i) =>
                          i === index ? { ...d, accepted, useLow } : d,
                        ),
                      },
                ),
              },
        ),
      })),
    durationText,

    preview,
    saving: create.isPending,
    error: create.isError ? errorCode(create.error) : undefined,
    /** Ends the wizard at any screen: title and servings are the only required fields. */
    finish: () => {
      const fields = toFields(wizardRecipe(state));
      setInvalid(fields.ok ? [] : fields.invalid);
      if (!fields.ok) {
        setScreen(0);
        return;
      }
      create.mutate();
    },
    restart: () => {
      clearDraft(key);
      setState(emptyWizard());
      setScreen(0);
    },
  };
}
