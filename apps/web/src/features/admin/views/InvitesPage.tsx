import { INVITE_MAX_DAYS, type InviteStatus } from '@cookit/shared';
import { useTranslation } from 'react-i18next';
import { CopyableLink } from '@/components/CopyableLink';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
            {vm.emailEnabled && (
              <>
                <FormField
                  label={t('admin.invites.email')}
                  hint={t('admin.invites.emailHint')}
                  type="email"
                  name="invite-email"
                  notCredential
                  value={vm.email}
                  onChange={(event) => vm.setEmail(event.target.value)}
                  error={vm.invalidEmail ? t('auth.invalid.email') : undefined}
                />
                {vm.email.trim() && (
                  <div className="grid gap-2">
                    <Label htmlFor="invite-locale">{t('admin.invites.emailLanguage')}</Label>
                    <Select value={vm.locale} onValueChange={vm.setLocale}>
                      <SelectTrigger id="invite-locale" className="h-11 w-full sm:w-72">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {vm.locales.map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`language.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
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
              {vm.email.trim() ? t('admin.invites.send') : t('admin.invites.create')}
            </Button>
            {vm.newLink && (
              <div className="grid gap-2" role="status">
                {vm.emailedTo && (
                  <p className="text-sm font-medium">
                    {t('admin.invites.emailed', { email: vm.emailedTo })}
                  </p>
                )}
                {vm.emailFailed && (
                  <p className="text-sm font-medium text-destructive">
                    {t('admin.invites.emailFailed')}
                  </p>
                )}
                <p className="text-sm">
                  {vm.emailedTo ? t('admin.invites.alsoLink') : t('admin.invites.created')}
                </p>
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

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('admin.email.title')}</h2>
          </CardTitle>
          <CardDescription>
            {vm.emailEnabled ? t('admin.email.on') : t('admin.email.off')}
          </CardDescription>
        </CardHeader>
        {vm.emailEnabled && (
          <CardContent className="grid gap-3">
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={vm.sendTestEmail}
              disabled={vm.testing}
            >
              {t('admin.email.test')}
            </Button>
            {vm.testSentTo && (
              <p role="status" className="text-sm">
                {t('admin.email.testSent', { email: vm.testSentTo })}
              </p>
            )}
            {vm.testError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription className="wrap-anywhere">
                  {t(`errors.${vm.testError}`, t('errors.unknown'))}
                  {vm.testDetail && ` (${vm.testDetail})`}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        )}
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
              {invite.email && (
                <span className="truncate text-sm">
                  {t('admin.invites.sentTo', { email: invite.email })}
                </span>
              )}
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
