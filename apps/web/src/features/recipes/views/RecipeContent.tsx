import { Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Markdown } from '@/components/Markdown';
import type { DisplayRecipe, DisplaySegment } from '../model/display';

/** Ingredients and steps of a recipe (page and editor preview). Presentational only. */
export function RecipeContent({
  recipe,
  durationText,
}: {
  recipe: DisplayRecipe;
  durationText: (seconds: number) => string;
}) {
  const { t } = useTranslation();
  const noIngredients = recipe.ingredientGroups.every((group) => group.items.length === 0);

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-labelledby="ingredients-title" className="grid content-start gap-3">
        <h2 id="ingredients-title" className="text-lg font-semibold">
          {t('recipes.ingredients')}
        </h2>
        {noIngredients && <p className="text-muted-foreground">{t('recipes.noIngredients')}</p>}
        {recipe.ingredientGroups.map((group, index) => (
          <div key={index} className="grid gap-2">
            {group.name && <h3 className="font-medium">{group.name}</h3>}
            <ul className="grid gap-1.5">
              {group.items.map((item, i) =>
                item.kind === 'text' ? (
                  <li key={i} className="list-none text-muted-foreground">
                    <Markdown text={item.text} inline />
                  </li>
                ) : (
                  <li key={i} className="ml-5 list-disc wrap-anywhere">
                    {item.text}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="steps-title" className="grid content-start gap-3">
        <h2 id="steps-title" className="text-lg font-semibold">
          {t('recipes.steps')}
        </h2>
        {recipe.empty && <p className="text-muted-foreground">{t('recipes.noSteps')}</p>}
        {recipe.stepGroups.map((group, index) => (
          <div key={index} className="grid gap-2">
            {group.name && <h3 className="font-medium">{group.name}</h3>}
            <ol className="grid gap-3">
              {group.items.map((item, i) =>
                item.kind === 'text' ? (
                  <li key={i} className="text-muted-foreground">
                    <Markdown text={item.text} inline />
                  </li>
                ) : (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                    >
                      {item.number}
                    </span>
                    <p className="min-w-0 pt-0.5 wrap-anywhere">
                      <span className="sr-only">
                        {t('recipes.stepNumber', { n: item.number })}{' '}
                      </span>
                      {item.segments.map((segment, s) => (
                        <Segment key={s} segment={segment} durationText={durationText} />
                      ))}
                    </p>
                  </li>
                ),
              )}
            </ol>
          </div>
        ))}
      </section>
    </div>
  );
}

function Segment({
  segment,
  durationText,
}: {
  segment: DisplaySegment;
  durationText: (seconds: number) => string;
}) {
  const { t } = useTranslation();
  if (segment.kind === 'text') return <Markdown text={segment.markdown} inline />;
  if (segment.kind === 'quantity') return <strong className="font-semibold">{segment.text}</strong>;
  return (
    <span
      className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 align-baseline text-sm text-secondary-foreground"
      title={t('recipes.timerTitle', {
        label: segment.label,
        duration: durationText(segment.seconds),
      })}
    >
      <Timer className="size-3.5" aria-hidden />
      {segment.text}
    </span>
  );
}
