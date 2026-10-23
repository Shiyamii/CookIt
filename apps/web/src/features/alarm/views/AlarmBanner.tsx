import { BellRing, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useAlarmViewModel } from '../viewmodels/useAlarmViewModel';

/** Over every page while a timer has finished: what rings, "+1 min", and a big "Stop". */
export function AlarmBanner() {
  const { t } = useTranslation();
  const vm = useAlarmViewModel();
  if (vm.finished.length === 0) return null;

  return (
    <div
      role="alert"
      aria-labelledby="alarm-banner-title"
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-50 mx-auto w-[calc(100%-2rem)] max-w-xl rounded-xl border-2 border-primary bg-card p-4 shadow-lg"
    >
      <h2 id="alarm-banner-title" className="flex items-center gap-2 text-lg font-semibold">
        <BellRing className="size-5 animate-pulse" aria-hidden />
        {t('alarm.banner.title', { count: vm.finished.length })}
      </h2>
      <ul className="mt-2 grid gap-1">
        {vm.finished.map((timer) => (
          <li key={timer.id} className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{timer.title || t('alarm.banner.timer')}</span>
              {timer.label && <span className="text-muted-foreground"> · {timer.label}</span>}
            </span>
            <Button
              variant="outline"
              size="sm"
              aria-label={t('alarm.banner.addMinute', { name: timer.label || timer.title })}
              onClick={() => vm.addMinute(timer.id)}
            >
              <Plus /> 1 min
            </Button>
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-3 w-full" onClick={vm.stop}>
        {t('alarm.banner.stop')}
      </Button>
    </div>
  );
}
