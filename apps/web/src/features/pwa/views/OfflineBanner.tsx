import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionViewModel } from '../viewmodels/useConnectionViewModel';

/** Shown in the layout while the device is offline. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const vm = useConnectionViewModel();
  if (!vm.offline) return null;
  return (
    <p
      role="status"
      className="flex items-center justify-center gap-2 bg-muted px-4 py-1 text-sm text-muted-foreground"
    >
      <WifiOff className="size-4" aria-hidden />
      {t('pwa.offline')}
    </p>
  );
}
