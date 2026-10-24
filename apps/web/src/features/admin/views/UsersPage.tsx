import { useTranslation } from 'react-i18next';
import { CopyableLink } from '@/components/CopyableLink';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUsersViewModel } from '../viewmodels/useUsersViewModel';

export function UsersPage() {
  const { t } = useTranslation();
  const vm = useUsersViewModel();

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.users.title')}</h1>

      {vm.actionError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t(`errors.${vm.actionError}`, t('errors.unknown'))}</AlertDescription>
        </Alert>
      )}

      {vm.resetLink && (
        <Alert role="status">
          <AlertDescription className="grid gap-2">
            <p>{t('admin.users.resetLinkFor', { user: vm.resetLink.user.username })}</p>
            <CopyableLink
              url={vm.resetLink.url}
              copied={vm.resetLink.copied}
              onCopy={() => void vm.copyResetLink()}
              label={t('admin.users.resetLink')}
            />
            <Button
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={vm.dismissResetLink}
            >
              {t('common.close')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}

      <ul className="grid grid-cols-1 gap-2">
        {vm.users.map((user) => (
          <li
            key={user.id}
            data-testid="user-row"
            className="grid min-w-0 gap-2 rounded-lg border p-3"
          >
            {/* Long names without spaces must truncate, not widen the page on a phone. */}
            <div className="flex min-w-0 items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  @{user.username} · {user.email}
                </p>
              </div>
              {user.role === 'admin' && <Badge>{t('admin.users.admin')}</Badge>}
              {user.listed && <Badge variant="secondary">{t('admin.users.listed')}</Badge>}
              {user.disabledAt && <Badge variant="destructive">{t('admin.users.disabled')}</Badge>}
            </div>
            {vm.isSelf(user) ? (
              <span className="text-sm text-muted-foreground">{t('admin.users.you')}</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={vm.busyId === user.id}
                  onClick={() => vm.toggleListed(user)}
                >
                  {user.listed ? t('admin.users.unlist') : t('admin.users.list')}
                </Button>
                {user.disabledAt ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={vm.busyId === user.id}
                    onClick={() => vm.enable(user)}
                  >
                    {t('admin.users.enable')}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={vm.busyId === user.id}
                    onClick={() => vm.disable(user)}
                  >
                    {t('admin.users.disable')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={vm.busyId === user.id}
                  onClick={() => vm.createResetLink(user)}
                >
                  {t('admin.users.createResetLink')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={vm.busyId === user.id}
                  onClick={() => vm.askDelete(user)}
                >
                  {t('admin.users.delete')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog
        open={vm.pendingDelete !== undefined}
        onOpenChange={(open) => !open && vm.cancelDelete()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin.users.deleteTitle', { user: vm.pendingDelete?.username ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{t('admin.users.deleteText')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={vm.confirmDelete}>
              {t('admin.users.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
