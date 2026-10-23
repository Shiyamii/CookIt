import { useQuery } from '@tanstack/react-query';
import { useCallback, useSyncExternalStore } from 'react';
import { useSession } from '@/features/auth/viewmodels/useSession';
import { ALARM_QUERY_KEY, deviceAlarm, effectiveAlarm, fetchAccountAlarm } from '../model/settings';

/** The account's alarm settings, this device's own (if any) and what applies here. */
export function useAlarmSettings() {
  const { user } = useSession();
  const userId = user?.id ?? '';
  const account = useQuery({
    queryKey: [...ALARM_QUERY_KEY, userId],
    queryFn: fetchAccountAlarm,
    enabled: user !== null,
    staleTime: 60_000,
  });
  const device = useSyncExternalStore(
    deviceAlarm.subscribe,
    useCallback(() => (userId ? deviceAlarm.get(userId) : undefined), [userId]),
  );
  return {
    userId,
    signedIn: user !== null,
    account: account.data,
    accountLoading: account.isPending && user !== null,
    device,
    effective: effectiveAlarm(account.data, device),
  };
}
