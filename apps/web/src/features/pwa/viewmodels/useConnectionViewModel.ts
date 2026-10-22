import { useSyncExternalStore } from 'react';
import { connection } from '../model/offline';

/** Whether the device is offline (pages and recipes already opened still work). */
export function useConnectionViewModel() {
  const online = useSyncExternalStore(connection.subscribe, connection.online, () => true);
  return { offline: !online };
}
