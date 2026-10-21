import { Timer, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWizardViewModel, WIZARD_SCREENS } from '../viewmodels/useWizardViewModel';
import { RecipeContent } from './RecipeContent';

type Vm = ReturnType<typeof useWizardViewModel>;

/** The step-by-step creation wizard (plan §5.2), one screen at a time. */
export function WizardPage() {
  const { t } = useTranslation();
  const vm = useWizardViewModel();
  const last = vm.screenIndex === vm.screenCount - 1;

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="text-2xl font-semibold">{t('recipes.wizard.title')}</h1>
      <ol className="flex flex-wrap gap-1 text-sm" aria-label={t('recipes.wizard.progress')}>
        {WIZARD_SCREENS.map((screen, index) => (
          <li key={screen}>
            <Button
              variant={index === vm.screenIndex ? 'default' : 'ghost'}
              size="sm"
              aria-current={index === vm.screenIndex ? 'step' : undefined}
              onClick={() => vm.goTo(index)}
            >
              {index + 1}. {t(`recipes.wizard.screens.${screen}`)}
            </Button>
          </li>
        ))}
      </ol>

      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}

      {vm.screen === 'info' && <InfoScreen vm={vm} />}
      {vm.screen === 'ingredients' && <IngredientsScreen vm={vm} />}
      {vm.screen === 'steps' && <StepsScreen vm={vm} />}
      {vm.screen === 'preview' &&
        (vm.preview ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-semibold wrap-anywhere">{vm.preview.title}</h2>
            <RecipeContent recipe={vm.preview} durationText={vm.durationText} />
          </div>
        ) : (
          <p className="text-muted-foreground">{t('recipes.editor.noPreview')}</p>
        ))}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {vm.screenIndex > 0 && (
          <Button variant="outline" onClick={() => vm.goTo(vm.screenIndex - 1)}>
            {t('recipes.wizard.back')}
          </Button>
        )}
        {!last && (
          <Button variant="outline" onClick={() => vm.goTo(vm.screenIndex + 1)}>
            {t('recipes.wizard.next')}
          </Button>
        )}
        <Button onClick={vm.finish} disabled={vm.saving}>
          {t('recipes.wizard.finish')}
        </Button>
        <Button variant="ghost" className="ml-auto" onClick={vm.restart}>
          {t('recipes.wizard.restart')}
        </Button>
      </div>
    </div>
  );
}

function InfoScreen({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4" aria-label={t('recipes.wizard.screens.info')}>
      <FormField
        label={t('recipes.fields.title')}
        required
        value={vm.state.title}
        onChange={(event) => vm.setField('title', event.target.value)}
        error={vm.invalid.includes('title') ? t('recipes.invalid.title') : undefined}
      />
      <FormField
        label={t('recipes.fields.servings')}
        inputMode="numeric"
        required
        value={vm.state.servings}
        onChange={(event) => vm.setField('servings', event.target.value)}
        error={vm.invalid.includes('servings') ? t('recipes.invalid.servings') : undefined}
      />
      <div className="grid gap-2">
        <Label htmlFor="wizard-description">{t('recipes.fields.description')}</Label>
        <Textarea
          id="wizard-description"
          rows={3}
          value={vm.state.description}
          onChange={(event) => vm.setField('description', event.target.value)}
        />
      </div>
      <FormField
        label={t('recipes.fields.source')}
        hint={t('recipes.add.optional')}
        value={vm.state.source}
        onChange={(event) => vm.setField('source', event.target.value)}
      />
    </section>
  );
}

function IngredientsScreen({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4" aria-label={t('recipes.wizard.screens.ingredients')}>
      <div className="grid gap-2">
        <Label htmlFor="paste-ingredients">{t('recipes.wizard.pasteIngredients')}</Label>
        <Textarea
          id="paste-ingredients"
          rows={5}
          className="wrap-anywhere"
          placeholder={t('recipes.wizard.pasteIngredientsPlaceholder')}
          value={vm.pastedIngredients}
          onChange={(event) => vm.setPastedIngredients(event.target.value)}
        />
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={!vm.pastedIngredients.trim()}
          onClick={vm.splitIngredients}
        >
          {t('recipes.wizard.split')}
        </Button>
      </div>
      {vm.state.ingredients.map((group) => (
        <div key={group.id} className="grid gap-2" data-testid="wizard-ingredient-group">
          {group.name && <h3 className="font-medium">{group.name}</h3>}
          {group.lines.map((line) => (
            <div key={line.id} className="flex gap-1">
              <Input
                aria-label={t('recipes.editor.ingredient')}
                className="h-10 min-w-0 flex-1"
                value={line.text}
                onChange={(event) => vm.setIngredient(group.id, line.id, event.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('recipes.editor.deleteRow')}
                onClick={() => vm.removeIngredient(group.id, line.id)}
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-start"
        onClick={() => vm.addIngredient()}
      >
        {t('recipes.editor.addIngredient')}
      </Button>
    </section>
  );
}

function StepsScreen({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-4" aria-label={t('recipes.wizard.screens.steps')}>
      <div className="grid gap-2">
        <Label htmlFor="paste-steps">{t('recipes.wizard.pasteSteps')}</Label>
        <Textarea
          id="paste-steps"
          rows={6}
          className="wrap-anywhere"
          placeholder={t('recipes.wizard.pasteStepsPlaceholder')}
          value={vm.pastedSteps}
          onChange={(event) => vm.setPastedSteps(event.target.value)}
        />
        <Button
          variant="outline"
          className="justify-self-start"
          disabled={!vm.pastedSteps.trim()}
          onClick={vm.splitSteps}
        >
          {t('recipes.wizard.split')}
        </Button>
      </div>
      {vm.state.steps.map((group) => (
        <div key={group.id} className="grid gap-3">
          {group.name && <h3 className="font-medium">{group.name}</h3>}
          {group.steps.map((step, index) => (
            <div
              key={step.id}
              className="grid gap-2 rounded-lg border p-3"
              data-testid="wizard-step"
            >
              <div className="flex items-start gap-1">
                <span className="mt-2 w-6 shrink-0 text-sm font-semibold">{index + 1}.</span>
                <Textarea
                  aria-label={t('recipes.editor.step')}
                  rows={2}
                  className="min-w-0 flex-1 wrap-anywhere"
                  value={step.text}
                  onChange={(event) => vm.setStep(group.id, step.id, event.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('recipes.editor.deleteRow')}
                  onClick={() => vm.removeStep(group.id, step.id)}
                >
                  <X />
                </Button>
              </div>
              {step.durations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {step.durations.map((duration, d) => (
                    <div key={d} className="flex flex-wrap items-center gap-1">
                      <Button
                        size="sm"
                        variant={duration.accepted ? 'default' : 'outline'}
                        aria-pressed={duration.accepted}
                        className="rounded-full"
                        onClick={() =>
                          vm.setTimer(group.id, step.id, d, !duration.accepted, duration.useLow)
                        }
                      >
                        <Timer />
                        {t('recipes.wizard.timer', { text: duration.text })}
                      </Button>
                      {duration.accepted && duration.lowSeconds !== undefined && (
                        <span className="flex gap-1 text-sm">
                          {[false, true].map((useLow) => (
                            <Button
                              key={String(useLow)}
                              size="sm"
                              variant={duration.useLow === useLow ? 'secondary' : 'ghost'}
                              aria-pressed={duration.useLow === useLow}
                              onClick={() => vm.setTimer(group.id, step.id, d, true, useLow)}
                            >
                              {vm.durationText(
                                useLow
                                  ? (duration.lowSeconds ?? duration.seconds)
                                  : duration.seconds,
                              )}
                            </Button>
                          ))}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
