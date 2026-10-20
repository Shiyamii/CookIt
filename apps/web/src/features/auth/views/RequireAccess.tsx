import { useTranslation } from 'react-i18next';
import { Navigate, Outlet } from 'react-router';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { useAccessViewModel } from '../viewmodels/useAccessViewModel';

/**
 * Route guard for the pages below it. Only a convenience: every API route checks the session and
 * the role on the server.
 */
export function RequireAccess({ level }: { level: 'user' | 'admin' }) {
  const { t } = useTranslation();
  const { access, loginPath } = useAccessViewModel(level);
  if (access === 'loading') return <p className="text-muted-foreground">{t('common.loading')}</p>;
  if (access === 'anonymous') return <Navigate to={loginPath} replace />;
  // A non-admin gets the same page as for an unknown address.
  if (access === 'forbidden') return <NotFoundPage />;
  return <Outlet />;
}
