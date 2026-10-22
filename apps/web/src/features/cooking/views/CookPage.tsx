import {
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  ListChecks,
  Minus,
  Play,
  Plus,
  Timer,
  X,
} from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { PushNotice } from '@/features/push/views/PushNotice';
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

  const step = vm.step;
  const last = vm.stepIndex >= vm.stepCount - 1;
  const ready = vm.recipeStatus === 'ready';

  return (
    <div className="grid grid-cols-1 gap-5 pb-28">
      <RecipeCards vm={vm} />
      {vm.offline && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('cook.offline')}
        </p>
      )}
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1">{t(`cook.errors.${vm.error}`)}</span>
            <Button size="sm" variant="outline" onClick={vm.dismissError}>
              {t('cook.dismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {vm.timers.length > 0 && <TimerBar vm={vm} />}
      <PushNotice />

      {vm.recipeStatus === 'loading' && (
        <p className="text-muted-foreground">{t('common.loading')}</p>
      )}
      {(vm.recipeStatus === 'recipe_missing' || vm.recipeStatus === 'incomplete') && (
        <div className="grid gap-3">
          <p className="text-muted-foreground">
            {t(vm.recipeStatus === 'incomplete' ? 'cook.incomplete' : 'cook.missing')}
          </p>
          <Button className="justify-self-start" onClick={vm.leaveRecipe}>
            {t(vm.alone ? 'cook.end' : 'cook.remove')}
          </Button>
        </div>
      )}

      {ready && (
        <header className="grid gap-2">
          <div className="flex items-start gap-2">
            <ColorDot color={vm.color} className="mt-2 size-3" />
            <h1 className="min-w-0 flex-1 text-xl font-semibold wrap-anywhere">{vm.title}</h1>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t('cook.actions')}>
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!vm.alone && (
                  <DropdownMenuItem onSelect={vm.askRemove}>{t('cook.remove')}</DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={vm.askEnd}>{t('cook.end')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        </header>
      )}

      {ready && step && (
        <section aria-labelledby="step-title" className="grid gap-4">
          <div className="grid gap-1">
            {step.groupName && (
              <p className="text-sm font-medium text-muted-foreground wrap-anywhere">
                {step.groupName}
              </p>
            )}
            <h2 id="step-title" className="text-sm font-semibold text-muted-foreground">
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

      {ready && (
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
            <Button className="h-14 text-lg" onClick={vm.askFinish}>
              {t('cook.finish')}
            </Button>
          ) : (
            <Button className="h-14 text-lg" onClick={vm.next}>
              {t('cook.next')} <ChevronRight className="size-6" />
            </Button>
          )}
        </nav>
      )}

      <AlertDialog
        open={vm.confirm !== undefined}
        onOpenChange={(open) => !open && vm.cancelConfirm()}
      >
        <AlertDialogContent>
          {vm.confirm === 'end' || (vm.confirm === 'finish' && vm.alone) ? (
            <Confirm
              title={t(vm.confirm === 'end' ? 'cook.endTitle' : 'cook.finishTitle', {
                title: vm.title,
              })}
              text={t('cook.endText')}
              action={t(vm.confirm === 'end' ? 'cook.end' : 'cook.finish')}
              onConfirm={vm.endSession}
            />
          ) : (
            <Confirm
              title={t(vm.confirm === 'finish' ? 'cook.finishTitle' : 'cook.removeTitle', {
                title: vm.title,
              })}
              text={t(vm.confirm === 'finish' ? 'cook.finishText' : 'cook.removeText')}
              action={t(vm.confirm === 'finish' ? 'cook.finish' : 'cook.remove')}
              onConfirm={vm.leaveRecipe}
            />
          )}
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
            <ColorDot color={timer.color} className="size-2.5" />
            <button
              type="button"
              className="min-w-0 flex-1 text-left text-sm wrap-anywhere"
              disabled={!timer.recipeId}
              onClick={() => timer.recipeId && vm.select(timer.recipeId)}
            >
              <span className="block font-medium">{timer.recipeTitle}</span>
              <span className="block text-muted-foreground">
                {timer.label || t('cook.stepTimer', { n: (timer.step ?? 0) + 1 })}
              </span>
            </button>
            <span
              className="font-mono text-xl font-semibold tabular-nums"
              role="timer"
              aria-label={
                timer.finished
                  ? t('cook.timerDone', { label: timer.label || timer.recipeTitle })
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

function ColorDot({ color, className }: { color: string; className: string }) {
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full ${COLOR_CLASSES[color] ?? ''} ${className}`}
    />
  );
}

function Confirm(props: { title: string; text: string; action: string; onConfirm: () => void }) {
  const { t } = useTranslation();
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{props.title}</AlertDialogTitle>
        <AlertDialogDescription>{props.text}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t('cook.continue')}</AlertDialogCancel>
        <AlertDialogAction onClick={props.onConfirm}>{props.action}</AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

/** One card per recipe of the session: its color, its step and its next timer; tap to show it. */
function RecipeCards({ vm }: { vm: Vm }) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('cook.recipes')}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {vm.cards.map((card) => {
        const title = card.title || (card.status === 'recipe_missing' ? '?' : '…');
        return (
          <button
            key={card.recipeId}
            type="button"
            data-testid="cook-card"
            aria-pressed={card.active}
            onClick={() => vm.select(card.recipeId)}
            className={`grid w-40 shrink-0 gap-1 rounded-lg border p-2 text-left text-sm ${
              card.active ? 'border-primary bg-accent text-accent-foreground' : 'bg-card'
            }`}
          >
            <span className="flex items-center gap-2">
              <ColorDot color={card.color} className="size-3" />
              <span className="line-clamp-2 font-medium wrap-anywhere">{title}</span>
            </span>
            <span
              className={`flex flex-wrap items-center gap-x-2 ${
                card.active ? '' : 'text-muted-foreground'
              }`}
            >
              {card.stepCount > 0 && (
                <>
                  <span aria-hidden>
                    {t('cook.cardStep', { n: card.stepNumber, total: card.stepCount })}
                  </span>
                  <span className="sr-only">
                    {t('cook.cardStepLabel', { n: card.stepNumber, total: card.stepCount })}
                  </span>
                </>
              )}
              {card.nextTimer && (
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  title={t('cook.cardTimers', { count: card.timerCount })}
                >
                  <Timer className="size-3.5" />
                  {card.nextTimer.finished ? t('cook.done') : card.nextTimer.countdown}
                  {card.timerCount > 1 && ` +${card.timerCount - 1}`}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {vm.canAdd && (
        <Button
          asChild
          variant="outline"
          className="h-auto min-h-16 w-28 shrink-0 self-stretch whitespace-normal"
        >
          <Link to="/recipes">
            <Plus /> {t('cook.addRecipe')}
          </Link>
        </Button>
      )}
    </div>
  );
}
