import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { shoppingSyncFor } from '../model/shopping';

const noSubscription = () => () => undefined;

/**
 * The signed-in user's shopping list, as the local copy and the server keep it: read again when
 * the page comes back, pending changes sent when the network returns.
 */
export function useShoppingSync() {
  const { user } = useSession();
  const sync = user ? shoppingSyncFor(user.id) : undefined;
  const snapshot = useSyncExternalStore(sync?.subscribe ?? noSubscription, () =>
    sync?.getSnapshot(),
  );

  useEffect(() => {
    if (!sync) return;
    void sync.refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync.refresh();
    };
    const onOnline = () => void sync.flush();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [sync]);

  return { sync, snapshot };
}
