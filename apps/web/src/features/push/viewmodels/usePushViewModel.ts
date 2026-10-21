import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCode } from '@/lib/api';
import {
  deviceName,
  disablePush,
  enablePush,
  fetchPushDevices,
  fetchPushKey,
  PUSH_QUERY_KEY,
  pushStatus,
  readBrowserPush,
  sendTestPush,
} from '../model/push';

/** A refusal of the server, or the browser failing to subscribe (push service unreachable…). */
const failure = (error: unknown) => {
  const code = errorCode(error);
  return code === 'unknown' ? 'push_failed' : code;
};

/**
 * Notifications on this device (plan §5.4): their state (on, off, blocked, iPhone needing the
 * home screen…), turning them on or off, a test, and the account's other devices.
 */
export function usePushViewModel(options: { devices?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const [testSent, setTestSent] = useState<number>();

  const key = useQuery({ queryKey: [...PUSH_QUERY_KEY, 'key'], queryFn: fetchPushKey });
  const publicKey = key.data?.publicKey ?? null;
  const browser = useQuery({
    queryKey: [...PUSH_QUERY_KEY, 'browser', publicKey !== null],
    queryFn: () => readBrowserPush(publicKey !== null),
    enabled: key.isSuccess,
  });
  const devices = useQuery({
    queryKey: [...PUSH_QUERY_KEY, 'devices'],
    queryFn: fetchPushDevices,
    enabled: options.devices === true && browser.isSuccess,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: PUSH_QUERY_KEY });
  const enable = useMutation({
    mutationFn: () => enablePush(publicKey ?? ''),
    onMutate: () => setError(undefined),
    onSuccess: () => refresh(),
    onError: (e) => setError(failure(e)),
  });
  const disable = useMutation({
    mutationFn: disablePush,
    onMutate: () => setError(undefined),
    onSuccess: () => refresh(),
    onError: (e) => setError(failure(e)),
  });
  const test = useMutation({
    mutationFn: sendTestPush,
    onMutate: () => {
      setError(undefined);
      setTestSent(undefined);
    },
    onSuccess: (result) => setTestSent(result.sent),
    onError: (e) => setError(failure(e)),
  });

  const status =
    key.isError || browser.isError
      ? ('error' as const)
      : browser.data
        ? pushStatus(browser.data, publicKey !== null)
        : ('loading' as const);
  const endpoint = browser.data?.endpoint;

  return {
    status,
    busy: enable.isPending || disable.isPending,
    error,
    enable: () => enable.mutate(),
    disable: () => disable.mutate(),
    test: () => test.mutate(),
    testing: test.isPending,
    testSent,
    devices: (devices.data ?? []).map((device) => ({
      id: device.id,
      name: deviceName(device.userAgent),
      createdAt: device.createdAt,
      current: device.endpoint === endpoint,
    })),
  };
}
