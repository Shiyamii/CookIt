import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useSiteSettingsViewModel } from '../viewmodels/useSiteSettingsViewModel';

/** The instance's settings (admin). */
export function SiteSettingsPage() {
  const { t } = useTranslation();
  const vm = useSiteSettingsViewModel();

  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.settings.title')}</h1>
      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}
      {vm.error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}
      {!vm.loading && !vm.loadError && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('admin.settings.galleryTitle')}</h2>
            </CardTitle>
            <CardDescription>{t('admin.settings.galleryHint')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox
                className="size-5"
                checked={vm.publicGallery}
                disabled={vm.saving}
                onCheckedChange={(checked) => vm.setPublicGallery(checked === true)}
              />
              <span>{t('admin.settings.publicGallery')}</span>
            </label>
            <p role="status" className="text-sm text-muted-foreground">
              {vm.publicGallery ? t('admin.settings.isPublic') : t('admin.settings.isMembers')}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
