import { Scale, Timer, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { EditorRow } from '../model/editor';
import { ItemMenu } from './GroupsEditor';
import type { EditorVm } from './VisualEditor';

type TimerForm = {
  /** The timer being edited (its segment in the step), or a new one at the cursor. */
  segment?: number;
  hours: string;
  minutes: string;
  label: string;
};

/**
 * A step: its text (markdown, timers written as links), with the timers and adjustable quantities
 * shown as chips under it. "Add a timer" inserts one at the cursor; a chip opens the same form to
 * change it; "Adjustable quantity" marks the selected text as following the servings.
 */
export function StepRowEditor({
  vm,
  row,
  handle,
  canUp,
  canDown,
}: {
  vm: EditorVm;
  row: EditorRow;
  handle: ReactNode;
  canUp: boolean;
  canDown: boolean;
}) {
  const { t } = useTranslation();
  const text = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef(0);
  const [form, setForm] = useState<TimerForm>();
  const [hint, setHint] = useState<string>();
  const setRaw = (raw: string) =>
    vm.dispatch({ type: 'setRow', part: 'steps', rowId: row.id, raw });
  const chips = row.kind === 'text' ? [] : vm.stepChips(row.raw);

  const submitTimer = (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const seconds = vm.timerSeconds(form.hours, form.minutes);
    if (seconds === undefined) {
      setHint(t('recipes.editor.invalidDuration'));
      return;
    }
    if (form.segment === undefined) {
      setRaw(vm.insertTimer(row.raw, cursor.current, seconds, form.label).raw);
    } else {
      setRaw(vm.updateTimer(row.raw, form.segment, seconds, form.label));
    }
    setForm(undefined);
    setHint(undefined);
  };

  const markQuantity = () => {
    const field = text.current;
    const marked = field && vm.markQuantity(row.raw, field.selectionStart, field.selectionEnd);
    if (marked) {
      setRaw(marked);
      setHint(undefined);
    } else {
      setHint(t('recipes.editor.selectQuantity'));
    }
  };

  return (
    <div className="grid gap-2" data-testid="step-row">
      <div className="flex items-start gap-1">
        {handle}
        <Textarea
          ref={text}
          aria-label={row.kind === 'text' ? t('recipes.editor.freeText') : t('recipes.editor.step')}
          rows={2}
          className="min-w-0 flex-1 wrap-anywhere"
          value={row.raw}
          onChange={(event) => setRaw(event.target.value)}
          onSelect={(event) => {
            cursor.current = event.currentTarget.selectionStart;
          }}
        />
        <ItemMenu
          label={t('recipes.editor.rowActions')}
          canUp={canUp}
          canDown={canDown}
          onUp={() =>
            vm.dispatch({ type: 'shiftRow', part: 'steps', rowId: row.id, direction: -1 })
          }
          onDown={() =>
            vm.dispatch({ type: 'shiftRow', part: 'steps', rowId: row.id, direction: 1 })
          }
          onDelete={() => vm.dispatch({ type: 'removeRow', part: 'steps', rowId: row.id })}
          deleteLabel={t('recipes.editor.deleteRow')}
        />
      </div>

      {row.kind === 'item' && (
        <div className="grid gap-2 pl-10">
          {chips.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label={t('recipes.editor.stepLinks')}>
              {chips.map((chip) => (
                <li
                  key={chip.segment}
                  className="flex items-center rounded-full bg-secondary text-sm text-secondary-foreground"
                >
                  {chip.kind === 'timer' ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-l-full py-1 pr-1 pl-2.5 hover:underline"
                      aria-label={t('recipes.editor.editTimer', { label: chip.label })}
                      onClick={() =>
                        setForm({
                          segment: chip.segment,
                          hours: String(Math.floor(chip.seconds / 3600) || ''),
                          minutes: String(Math.floor((chip.seconds % 3600) / 60) || ''),
                          label: chip.label === chip.text ? '' : chip.label,
                        })
                      }
                    >
                      <Timer className="size-3.5" aria-hidden />
                      {chip.label === chip.text ? chip.text : `${chip.label} · ${chip.text}`}
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 py-1 pr-1 pl-2.5">
                      <Scale className="size-3.5" aria-hidden />
                      {chip.text}
                    </span>
                  )}
                  <button
                    type="button"
                    className="rounded-r-full p-1.5 hover:bg-accent"
                    aria-label={t('recipes.editor.unlink', { text: chip.text })}
                    onClick={() => setRaw(vm.unlinkSegment(row.raw, chip.segment))}
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {form ? (
            <form
              className="grid gap-3 rounded-md border bg-muted/40 p-3"
              onSubmit={submitTimer}
              aria-label={t('recipes.editor.timerForm')}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="grid gap-1">
                  <Label htmlFor={`${row.id}-hours`}>{t('recipes.editor.hours')}</Label>
                  <Input
                    id={`${row.id}-hours`}
                    inputMode="numeric"
                    className="h-10 w-20"
                    value={form.hours}
                    onChange={(event) => setForm({ ...form, hours: event.target.value })}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor={`${row.id}-minutes`}>{t('recipes.editor.minutes')}</Label>
                  <Input
                    id={`${row.id}-minutes`}
                    inputMode="numeric"
                    autoFocus
                    className="h-10 w-20"
                    value={form.minutes}
                    onChange={(event) => setForm({ ...form, minutes: event.target.value })}
                  />
                </div>
                <div className="grid min-w-40 flex-1 gap-1">
                  <Label htmlFor={`${row.id}-label`}>{t('recipes.editor.timerLabel')}</Label>
                  <Input
                    id={`${row.id}-label`}
                    className="h-10"
                    placeholder={t('recipes.editor.timerLabelPlaceholder')}
                    value={form.label}
                    onChange={(event) => setForm({ ...form, label: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  {form.segment === undefined
                    ? t('recipes.editor.insertTimer')
                    : t('recipes.editor.saveTimer')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm(undefined);
                    setHint(undefined);
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm({ hours: '', minutes: '', label: '' })}
              >
                <Timer /> {t('recipes.editor.addTimer')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                // Keep the text selection: the button must not take the focus first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={markQuantity}
              >
                <Scale /> {t('recipes.editor.markQuantity')}
              </Button>
            </div>
          )}
          {hint && (
            <p role="status" className="text-sm text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
