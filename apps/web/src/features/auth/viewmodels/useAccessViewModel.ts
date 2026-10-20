import { useLocation } from 'react-router';
import { useSession } from './useSession';

/** What a protected page may show: wait, redirect to sign-in, refuse (not admin) or render. */
export function useAccessViewModel(level: 'user' | 'admin') {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const access = isLoading
    ? 'loading'
    : !user
      ? 'anonymous'
      : level === 'admin' && user.role !== 'admin'
        ? 'forbidden'
        : 'granted';
  return { access, loginPath: `/login?redirect=${encodeURIComponent(location.pathname)}` } as const;
}
