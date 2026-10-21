import { ChevronLeft, ChevronRight, Minus, Play, Plus, Timer, X, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Markdown } from '@/components/Markdown';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useCookViewModel } from '../viewmodels/useCookViewModel';

type Vm = ReturnType<typeof useCookViewModel>;

/** Background classes of the recipe colors (theme tokens, listed for Tailwind). */
const COLOR_CLASSES: Record<string, string> = {
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
  'chart-5': 'bg-chart-5',
};

/** The cooking mode: one step at a time, large buttons, timers, ingredients in a drawer. */
export function CookPage() {
  const { t } = useTranslation();
  const vm = useCookViewModel();

  if (vm.status === 'loading')
    return <p className="text-muted-foreground">{t('common.loading')}</p>;

  if (vm.status === 'confirm_replace') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('cook.title')}</h1>
        <p>{t('cook.replaceText')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={vm.replaceSession}>
            {t('cook.replace')}
          </Button>
          <Button size="lg" variant="outline" onClick={vm.keepSession}>
            {t('cook.keep')}
          </Button>
        </div>
      </div>
    );
  }

  if (vm.status === 'empty') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('cook.title')}</h1>
        <p className="text-muted-foreground">{t('cook.empty')}</p>
        <Button asChild className="justify-self-start">
          <Link to="/recipes">{t('cook.chooseRecipe')}</Link>
        </Button>
      </div>
    );
  }

  if (vm.status === 'recipe_missing' || vm.status === 'incomplete') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">{t('cook.title')}</h1>
        <p className="text-muted-foreground">
          {t(vm.status === 'incomplete' ? 'cook.incomplete' : 'cook.missing')}
        </p>
        <Button className="justify-self-start" onClick={vm.endSession}>
          {t('cook.end')}
        </Button>
      </div>
    );
  }

  const step = vm.step;
  const last = vm.stepIndex >= vm.stepCount - 1;

  return (
    <div className="grid grid-cols-1 gap-5 pb-28">
      <header className="grid gap-2">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={`mt-2 size-3 shrink-0 rounded-full ${COLOR_CLASSES[vm.color] ?? ''}`}
          />
          <h1 className="min-w-0 flex-1 text-xl font-semibold wrap-anywhere">{vm.title}</h1>
          <Button variant="ghost" size="sm" onClick={vm.askEnd}>
            {t('cook.end')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IngredientsDrawer vm={vm} />
          {vm.languages.length > 1 && (
            <div role="group" aria-label={t('cook.language')} className="flex gap-1">
              {vm.languages.map((language) => (
                <Button
                  key={language}
                  size="sm"
                  variant={language === vm.lang ? 'default' : 'outline'}
                  aria-pressed={language === vm.lang}
                  onClick={() => void vm.chooseLanguage(language)}
                >
                  {language.toUpperCase()}
                </Button>
              ))}
            </div>
          )}
        </div>
        {vm.offline && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('cook.offline')}
          </p>
        )}
        {vm.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t(`cook.errors.${vm.error}`)}</AlertDescription>
          </Alert>
        )}
      </header>

      {vm.timers.length > 0 && <TimerBar vm={vm} />}

      {step && (
        <section aria-labelledby="step-title" className="grid gap-4">
          <div className="grid gap-1">
            {step.groupName && (
              <p className="text-sm font-medium text-muted-foreground wrap-anywhere">
                {step.groupName}
              </p>
            )}
            <h2 id="step-title" className="text-sm font-semibold text-primary">
              {t('cook.stepOf', { n: vm.stepIndex + 1, total: vm.stepCount })}
            </h2>
          </div>
          {step.notes.map((note, index) => (
            <p key={index} className="text-muted-foreground">
              <Markdown text={note} inline />
            </p>
          ))}
          <p className="text-2xl leading-relaxed wrap-anywhere" data-testid="cook-step">
            {(() => {
              let slot = 0;
              return step.segments.map((segment, index) => {
                if (segment.kind === 'text') {
                  return <Markdown key={index} text={segment.markdown} inline />;
                }
                if (segment.kind === 'quantity') {
                  return (
                    <strong key={index} className="font-semibold">
                      {segment.text}
                    </strong>
                  );
                }
                const timerSlot = slot++;
                const running = vm.stepTimer(step.index, timerSlot);
                return (
                  <Button
                    key={index}
                    variant={running ? 'default' : 'secondary'}
                    className="mx-1 h-auto rounded-full px-3 py-1 align-baseline text-xl"
                    aria-label={
                      running
                        ? t('cook.timerRunning', { text: segment.text, left: running.countdown })
                        : t('cook.startTimer', {
                            text: segment.text,
                            duration: vm.durationText(segment.seconds),
                          })
                    }
                    onClick={() =>
                      running
                        ? undefined
                        : vm.startStepTimer(step.index, timerSlot, segment.seconds, segment.label)
                    }
                  >
                    {running ? <Timer /> : <Play />}
                    {running ? running.countdown : segment.text}
                  </Button>
                );
              });
            })()}
          </p>
        </section>
      )}

      <nav
        aria-label={t('cook.navigation')}
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-2 gap-3 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
      >
        <Button
          variant="outline"
          className="h-14 text-lg"
          disabled={vm.stepIndex === 0}
          onClick={vm.previous}
        >
          <ChevronLeft className="size-6" /> {t('cook.previous')}
        </Button>
        {last ? (
          <Button className="h-14 text-lg" onClick={vm.askEnd}>
            {t('cook.finish')}
          </Button>
        ) : (
          <Button className="h-14 text-lg" onClick={vm.next}>
            {t('cook.next')} <ChevronRight className="size-6" />
          </Button>
        )}
      </nav>

      <AlertDialog open={vm.confirmEnd} onOpenChange={(open) => !open && vm.cancelEnd()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('cook.endTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('cook.endText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cook.continue')}</AlertDialogCancel>
            <AlertDialogAction onClick={vm.endSession}>{t('cook.end')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TimerBar({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('cook.timers')}>
      <ul className="grid gap-2">
        {vm.timers.map((timer) => (
          <li
            key={timer.id}
            data-testid="cook-timer"
            className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
              timer.finished ? 'border-primary bg-primary/10' : ''
            }`}
          >
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${COLOR_CLASSES[vm.color] ?? ''}`}
            />
            <span className="min-w-0 flex-1 text-sm wrap-anywhere">
              {timer.label || t('cook.stepTimer', { n: (timer.step ?? 0) + 1 })}
            </span>
            <span
              className="font-mono text-xl font-semibold tabular-nums"
              role="timer"
              aria-label={
                timer.finished
                  ? t('cook.timerDone', { label: timer.label })
                  : t('cook.timerLeft', { left: timer.countdown })
              }
            >
              {timer.finished ? t('cook.done') : timer.countdown}
            </span>
            <Button variant="outline" size="sm" onClick={() => vm.addMinute(timer.id)}>
              <Plus /> {t('cook.addMinute')}
            </Button>
            <Button
              variant={timer.finished ? 'default' : 'ghost'}
              size="sm"
              aria-label={timer.finished ? t('cook.dismiss') : t('cook.cancelTimer')}
              onClick={() => vm.removeTimer(timer.id)}
            >
              {timer.finished ? t('cook.dismiss') : <X />}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function IngredientsDrawer({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <ListChecks /> {t('cook.ingredients')}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('cook.ingredients')}</SheetTitle>
          <SheetDescription>{t('cook.ingredientsHint')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" id="cook-servings">
              {t('recipes.fields.servings')}
            </span>
            <div role="group" aria-labelledby="cook-servings" className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={t('recipes.fewerServings')}
                disabled={vm.servings <= 1}
                onClick={() => vm.setServings(vm.servings - 1)}
              >
                <Minus />
              </Button>
              <output aria-live="polite" className="w-10 text-center text-lg font-semibold">
                {vm.servings}
              </output>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('recipes.moreServings')}
                disabled={vm.servings >= 1000}
                onClick={() => vm.setServings(vm.servings + 1)}
              >
                <Plus />
              </Button>
            </div>
          </div>
          {vm.ingredients.map((group, g) => (
            <div key={g} className="grid gap-2">
              {group.name && <h3 className="font-medium">{group.name}</h3>}
              <ul className="grid gap-1">
                {group.items.map((entry, i) =>
                  entry.kind === 'text' ? (
                    <li key={i} className="text-muted-foreground">
                      <Markdown text={entry.text} inline />
                    </li>
                  ) : (
                    <li key={i}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <Checkbox
                          className="size-5"
                          checked={entry.checked}
                          onCheckedChange={() => vm.toggleIngredient(entry.index)}
                        />
                        <span
                          className={`wrap-anywhere ${entry.checked ? 'text-muted-foreground line-through' : ''}`}
                        >
                          {entry.text}
                        </span>
                      </label>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
