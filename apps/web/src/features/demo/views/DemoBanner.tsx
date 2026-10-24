import { FlaskConical, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DemoRole } from '@/demo/session';
import { useDemoBannerViewModel } from '../viewmodels/useDemoBannerViewModel';

/** On every page of the demo: what it is, who you are (member or admin), start again. */
export function DemoBanner() {
  const { t } = useTranslation();
  const vm = useDemoBannerViewModel();

  return (
    <aside aria-label={t('demo.label')} className="border-b bg-secondary text-secondary-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 text-sm">
        <p className="flex min-w-0 flex-1 basis-56 items-center gap-2">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          <span>{t('demo.notice')}</span>
        </p>
        <div className="flex items-center gap-2">
          <Select value={vm.role} onValueChange={(value) => vm.chooseRole(value as DemoRole)}>
            <SelectTrigger aria-label={t('demo.as')} className="h-9 w-40 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vm.roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {t(`demo.${role}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 bg-background" onClick={vm.askReset}>
            <RotateCcw /> {t('demo.reset')}
          </Button>
        </div>
      </div>

      <AlertDialog open={vm.confirmReset} onOpenChange={(open) => !open && vm.cancelReset()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('demo.resetTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('demo.resetText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void vm.reset()}>{t('demo.reset')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
