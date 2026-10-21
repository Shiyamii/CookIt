import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useMainNavViewModel } from '../viewmodels/useMainNavViewModel';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent ${
    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
  }`;

export function MainNav() {
  const { t } = useTranslation();
  const vm = useMainNavViewModel();
  if (vm.loading) return null;
  return (
    <nav aria-label={t('nav.label')} className="flex gap-1">
      {vm.signedIn && (
        <NavLink to="/recipes" className={linkClass} end={false}>
          {t('nav.myRecipes')}
        </NavLink>
      )}
      <NavLink to="/gallery" className={linkClass}>
        {t('nav.gallery')}
      </NavLink>
    </nav>
  );
}
