import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
import { NotInDemo } from '@/components/NotInDemo';
import { PictureButton } from '@/components/PictureButton';
import { UserAvatar } from '@/components/UserAvatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useProfileViewModel } from '../viewmodels/useProfileViewModel';

/** The user's profile: picture, display name, and whether to appear in the members list. */
export function ProfilePage() {
  const { t } = useTranslation();
  const vm = useProfileViewModel();

  return (
    <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('account.profile.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('account.profile.picture')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {vm.pictureError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t(`errors.${vm.pictureError}`, t('errors.unknown'))}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <UserAvatar
              image={vm.image}
              name={vm.name || vm.username}
              className="size-24 text-3xl"
            />
            <NotInDemo>
              <div className="flex flex-wrap gap-2">
                <PictureButton
                  label={vm.image ? t('account.profile.change') : t('account.profile.add')}
                  disabled={vm.pictureBusy}
                  onFile={vm.choosePicture}
                />
                {vm.image && (
                  <Button variant="ghost" onClick={vm.removePicture} disabled={vm.pictureBusy}>
                    <Trash2 /> {t('account.profile.remove')}
                  </Button>
                )}
              </div>
            </NotInDemo>
          </div>
          {vm.pictureBusy && (
            <p role="status" className="text-sm text-muted-foreground">
              {t('common.loading')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('account.profile.name')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={vm.saveName} noValidate>
            {vm.nameError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {t(`errors.${vm.nameError}`, t('errors.unknown'))}
                </AlertDescription>
              </Alert>
            )}
            {vm.nameSaved && (
              <Alert role="status">
                <AlertDescription>{t('account.profile.saved')}</AlertDescription>
              </Alert>
            )}
            <FormField
              label={t('account.profile.name')}
              hint={t('account.profile.nameHint', { username: vm.username })}
              autoComplete="nickname"
              maxLength={100}
              value={vm.name}
              onChange={(event) => vm.setName(event.target.value)}
              error={vm.invalidName ? t('account.profile.nameRequired') : undefined}
            />
            <Button type="submit" className="justify-self-start" disabled={vm.savingName}>
              {t('common.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('account.profile.membersTitle')}</h2>
          </CardTitle>
          <CardDescription>{t('account.profile.membersHint')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {vm.listedError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t(`errors.${vm.listedError}`, t('errors.unknown'))}
              </AlertDescription>
            </Alert>
          )}
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <Checkbox
              className="size-5"
              checked={vm.listed === true}
              disabled={vm.listed === null || vm.listedSaving}
              onCheckedChange={(checked) => vm.setListed(checked === true)}
            />
            <span>{t('account.profile.listed')}</span>
          </label>
        </CardContent>
      </Card>
    </div>
  );
}
