import { CircleUser, LogOut, Mail, ShieldCheck, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUserMenuViewModel } from '../viewmodels/useUserMenuViewModel';

export function UserMenu() {
  const { t } = useTranslation();
  const vm = useUserMenuViewModel();

  if (vm.isLoading) return null;
  if (!vm.user) {
    return (
      <Button asChild variant="ghost">
        <Link to="/login">{t('auth.login.title')}</Link>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('auth.menu.label')}>
          <CircleUser />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="truncate">{vm.user.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account/security">
            <ShieldCheck /> {t('account.security.title')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {vm.isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/admin/invites">
                <Mail /> {t('admin.invites.title')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/users">
                <Users /> {t('admin.users.title')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={vm.signOut}>
          <LogOut /> {t('auth.menu.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
