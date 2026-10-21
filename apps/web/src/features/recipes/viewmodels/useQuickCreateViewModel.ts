import { isLocale, type Locale } from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { errorCode } from '@/lib/api';
import { emptyRecipe, toBody, toFields, type InvalidField } from '../model/editor';
import { createRecipe, RECIPES_QUERY_KEY } from '../model/recipes';

/**
 * "Add a recipe" page, quick creation (plan §5.2): title and servings (description and source
 * optional) create the recipe at once, with empty ingredients and steps, then the editor opens.
 */
export function useQuickCreateViewModel() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('4');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [lang, setLang] = useState<Locale>(
    isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'fr',
  );
  const [invalid, setInvalid] = useState<InvalidField[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const recipe = { ...emptyRecipe(), title, servings, description, source };
      const fields = toFields(recipe);
      if (!fields.ok) throw new Error('invalid_fields');
      // Empty ingredients and steps: the separator alone.
      const body = toBody({ ...recipe, ingredientGroups: [], stepGroups: [] }, lang);
      return createRecipe({ ...fields.fields, body, lang });
    },
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: RECIPES_QUERY_KEY });
      await navigate(`/recipes/${id}/edit`);
    },
  });

  return {
    title,
    setTitle,
    servings,
    setServings,
    description,
    setDescription,
    source,
    setSource,
    lang,
    setLang,
    invalid,
    submitting: create.isPending,
    error: create.isError ? errorCode(create.error) : undefined,
    submit: (event: FormEvent) => {
      event.preventDefault();
      const fields = toFields({ ...emptyRecipe(), title, servings });
      setInvalid(fields.ok ? [] : fields.invalid);
      if (fields.ok) create.mutate();
    },
  };
}
