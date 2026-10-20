import { INVITE_MAX_DAYS, type InviteStatus } from '@cookit/shared';
import { useTranslation } from 'react-i18next';
import { CopyableLink } from '@/components/CopyableLink';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useInvitesViewModel } from '../viewmodels/useInvitesViewModel';

const statusVariant: Record<InviteStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'default',
  used: 'secondary',
  expired: 'outline',
  revoked: 'destructive',
};

export function InvitesPage() {
  const { t, i18n } = useTranslation();
  const vm = useInvitesViewModel();
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.resolvedLanguage);

  return (
    <div className="grid grid-cols-1 gap-6">
      <h1 className="text-2xl font-semibold">{t('admin.invites.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('admin.invites.create')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={vm.submit} noValidate>
            {vm.createError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {t(`errors.${vm.createError}`, t('errors.unknown'))}
                </AlertDescription>
              </Alert>
            )}
            <FormField
              label={t('admin.invites.label')}
              hint={t('admin.invites.labelHint')}
              value={vm.label}
              onChange={(event) => vm.setLabel(event.target.value)}
            />
            <FormField
              label={t('admin.invites.days')}
              type="number"
              inputMode="numeric"
              min={1}
              max={INVITE_MAX_DAYS}
              value={vm.days}
              onChange={(event) => vm.setDays(event.target.value)}
              error={
                vm.invalidDays
                  ? t('admin.invites.invalidDays', { max: INVITE_MAX_DAYS })
                  : undefined
              }
            />
            <Button type="submit" size="lg" disabled={vm.creating}>
              {t('admin.invites.create')}
            </Button>
            {vm.newLink && (
              <div className="grid gap-2" role="status">
                <p className="text-sm">{t('admin.invites.created')}</p>
                <CopyableLink
                  url={vm.newLink}
                  copied={vm.copied}
                  onCopy={() => void vm.copyNewLink()}
                  label={t('admin.invites.link')}
                />
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-3" aria-labelledby="invites-list">
        <h2 id="invites-list" className="text-lg font-semibold">
          {t('admin.invites.list')}
        </h2>
        {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}
        {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}
        {!vm.loading && vm.invites.length === 0 && (
          <p className="text-muted-foreground">{t('admin.invites.empty')}</p>
        )}
        <ul className="grid grid-cols-1 gap-2">
          {vm.invites.map((invite) => (
            <li
              key={invite.id}
              data-testid="invite-row"
              className="grid min-w-0 gap-1 rounded-lg border p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {invite.label ?? t('admin.invites.noLabel')}
                </span>
                <Badge variant={statusVariant[invite.status]}>
                  {t(`admin.invites.status.${invite.status}`)}
                </Badge>
              </div>
              <span className="truncate text-sm text-muted-foreground">
                {invite.status === 'used'
                  ? t('admin.invites.usedBy', {
                      user: invite.usedByUsername ?? '?',
                      date: date(invite.usedAt ?? invite.createdAt),
                    })
                  : t('admin.invites.expires', { date: date(invite.expiresAt) })}
              </span>
              {invite.status === 'pending' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  disabled={vm.revokingId === invite.id}
                  onClick={() => vm.revoke(invite.id)}
                >
                  {t('admin.invites.revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
