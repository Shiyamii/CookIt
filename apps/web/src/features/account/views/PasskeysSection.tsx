import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FormField } from '@/components/FormField';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePasskeysViewModel } from '../viewmodels/usePasskeysViewModel';

export function PasskeysSection() {
  const { t, i18n } = useTranslation();
  const vm = usePasskeysViewModel();
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(i18n.language) : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('account.passkeys.title')}</h2>
        </CardTitle>
        <CardDescription>{t('account.passkeys.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {vm.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{t(`errors.${vm.error}`, t('errors.unknown'))}</AlertDescription>
          </Alert>
        )}
        {vm.added && (
          <Alert role="status">
            <AlertDescription>{t('account.passkeys.added')}</AlertDescription>
          </Alert>
        )}
        {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}

        {!vm.loading && vm.passkeys.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('account.passkeys.empty')}</p>
        )}
        <ul className="grid grid-cols-1 gap-2">
          {vm.passkeys.map((passkey) => (
            <li
              key={passkey.id}
              data-testid="passkey-row"
              className="grid min-w-0 gap-2 rounded-lg border p-3"
            >
              {vm.editing?.id === passkey.id ? (
                <form className="grid gap-2" onSubmit={vm.submitRename} noValidate>
                  <FormField
                    label={t('account.passkeys.name')}
                    autoFocus
                    value={vm.editing.name}
                    onChange={(event) => vm.setEditingName(event.target.value)}
                    error={vm.editingInvalid ? t('account.passkeys.invalidName') : undefined}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={vm.busy}>
                      {t('account.passkeys.save')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={vm.cancelRename}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex min-w-0 items-start gap-2">
                    <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {passkey.name ?? t('account.passkeys.unnamed')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('account.passkeys.created', { date: date(passkey.createdAt) })}
                        {passkey.backedUp && ` · ${t('account.passkeys.synced')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={vm.busy}
                      onClick={() => vm.startRename(passkey)}
                    >
                      {t('account.passkeys.rename')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={vm.busy}
                      onClick={() => vm.askDelete(passkey)}
                    >
                      {t('account.passkeys.delete')}
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {vm.supported ? (
          <form className="grid gap-2" onSubmit={vm.submitAdd} noValidate>
            <FormField
              label={t('account.passkeys.newName')}
              hint={t('account.passkeys.newNameHint')}
              value={vm.name}
              onChange={(event) => vm.setName(event.target.value)}
              error={vm.nameInvalid ? t('account.passkeys.invalidName') : undefined}
            />
            <FormField
              label={t('auth.fields.password')}
              hint={t('account.passkeys.passwordHint')}
              type="password"
              autoComplete="current-password"
              required
              value={vm.password}
              onChange={(event) => vm.setPassword(event.target.value)}
            />
            <Button type="submit" className="justify-self-start" disabled={vm.busy || !vm.password}>
              <KeyRound /> {t('account.passkeys.add')}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{t('account.passkeys.unsupported')}</p>
        )}
      </CardContent>

      <AlertDialog
        open={vm.pendingDelete !== undefined}
        onOpenChange={(open) => !open && vm.cancelDelete()}
      >
        <AlertDialogContent>
          <form className="grid gap-4" onSubmit={vm.confirmDelete} noValidate>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t('account.passkeys.deleteTitle', {
                  name: vm.pendingDelete?.name ?? t('account.passkeys.unnamed'),
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>{t('account.passkeys.deleteText')}</AlertDialogDescription>
            </AlertDialogHeader>
            <FormField
              label={t('auth.fields.password')}
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={vm.password}
              onChange={(event) => vm.setPassword(event.target.value)}
            />
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{t('common.cancel')}</AlertDialogCancel>
              {/* A plain submit button: AlertDialogAction would close the dialog before the request. */}
              <Button type="submit" variant="destructive" disabled={vm.busy || !vm.password}>
                {t('account.passkeys.delete')}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
