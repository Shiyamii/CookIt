import type { AlarmSettings } from '@cookit/shared';
import { AlarmClock, Play, Save } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAlarmSettingsViewModel } from '../viewmodels/useAlarmSettingsViewModel';

type Vm = ReturnType<typeof useAlarmSettingsViewModel>;

/** The alarm of finished timers: the account's settings, and this device's own. */
export function AlarmPage() {
  const { t } = useTranslation();
  const vm = useAlarmSettingsViewModel();

  if (vm.loading) return <p className="text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid gap-1">
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <AlarmClock className="size-7" aria-hidden /> {t('alarm.title')}
        </h1>
        <p className="text-muted-foreground">{t('alarm.subtitle')}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('alarm.account.title')}</h2>
          </CardTitle>
          <CardDescription>{t('alarm.account.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SettingsFields
            id="account"
            settings={vm.account}
            sounds={vm.sounds}
            onChange={vm.changeAccount}
            onListen={() => vm.listen(vm.account)}
            repeatHint={t('alarm.repeatHintAccount')}
          />
          {vm.saveError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t(`errors.${vm.saveError}`, t('errors.unknown'))}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={vm.saveAccount} disabled={!vm.accountChanged || vm.saving}>
              <Save /> {t('alarm.save')}
            </Button>
            {vm.saved && (
              <p role="status" className="text-sm">
                {t('alarm.saved')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('alarm.device.title')}</h2>
          </CardTitle>
          <CardDescription>{t('alarm.device.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              className="size-5"
              checked={vm.device !== undefined}
              onCheckedChange={(checked) => vm.setOwnOnDevice(checked === true)}
            />
            <span>{t('alarm.device.own')}</span>
          </label>
          {vm.device && (
            <SettingsFields
              id="device"
              settings={vm.device}
              sounds={vm.sounds}
              onChange={vm.changeDevice}
              onListen={() => vm.device && vm.listen(vm.device)}
              repeatHint={t('alarm.repeatHintDevice')}
            />
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{t('alarm.limits')}</p>
    </div>
  );
}

function SettingsFields({
  id,
  settings,
  sounds,
  onChange,
  onListen,
  repeatHint,
}: {
  id: string;
  settings: AlarmSettings;
  sounds: Vm['sounds'];
  onChange: (change: Partial<AlarmSettings>) => void;
  onListen: () => void;
  repeatHint: string;
}) {
  const { t } = useTranslation();
  const volumeId = useId();
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${id}-sound`}>{t('alarm.sound')}</Label>
        <div className="flex flex-wrap gap-2">
          <Select
            value={settings.sound}
            onValueChange={(value) => onChange({ sound: value as AlarmSettings['sound'] })}
          >
            <SelectTrigger id={`${id}-sound`} className="h-11 min-w-48 flex-1 sm:flex-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sounds.map((sound) => (
                <SelectItem key={sound} value={sound}>
                  {t(`alarm.sounds.${sound}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="lg" onClick={onListen}>
            <Play /> {t('alarm.listen')}
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={volumeId}>
          {t('alarm.volume')} <span className="text-muted-foreground">{settings.volume} %</span>
        </Label>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={settings.volume}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
          className="h-11 w-full accent-primary sm:w-72"
        />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <Checkbox
          className="size-5"
          checked={settings.vibrate}
          onCheckedChange={(checked) => onChange({ vibrate: checked === true })}
        />
        <span>{t('alarm.vibrate')}</span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <Checkbox
          className="mt-0.5 size-5"
          checked={settings.repeat}
          onCheckedChange={(checked) => onChange({ repeat: checked === true })}
        />
        <span className="grid gap-0.5">
          <span>{t('alarm.repeat')}</span>
          <span className="text-sm text-muted-foreground">{repeatHint}</span>
        </span>
      </label>
    </div>
  );
}
