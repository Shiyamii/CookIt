import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { UserAvatar } from '@/components/UserAvatar';
import { Input } from '@/components/ui/input';
import { useMembersViewModel } from '../viewmodels/useMembersViewModel';

/** The members who chose to appear in the list, with their public recipes count. */
export function MembersPage() {
  const { t } = useTranslation();
  const vm = useMembersViewModel();

  return (
    <div className="grid grid-cols-1 gap-5">
      <h1 className="text-2xl font-semibold">{t('members.title')}</h1>
      <p className="text-muted-foreground">
        {t('members.subtitle')}{' '}
        <Link
          to="/account/profile"
          className="text-foreground underline decoration-primary decoration-2 underline-offset-2"
        >
          {t('members.yourChoice')}
        </Link>
      </p>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={t('members.search')}
          placeholder={t('members.search')}
          className="h-11 pl-9"
          value={vm.search}
          onChange={(event) => vm.setSearch(event.target.value)}
        />
      </div>

      {vm.loading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {vm.loadError && <p className="text-destructive">{t('errors.unknown')}</p>}
      {!vm.loading && !vm.loadError && vm.members.length === 0 && (
        <p className="text-muted-foreground">
          {vm.empty ? t('members.empty') : t('members.noResults')}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {vm.members.map((member) => (
          <li key={member.username} data-testid="member-card">
            <Link
              to={`/members/${encodeURIComponent(member.username)}`}
              className="flex min-w-0 items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <UserAvatar image={member.image} name={member.name} className="size-12 text-lg" />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{member.name}</span>
                <span className="truncate text-sm text-muted-foreground">@{member.username}</span>
                <span className="text-xs text-muted-foreground">
                  {t('members.publicRecipes', { count: member.publicRecipes })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
