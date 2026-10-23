import { ALARM_SOUNDS, DEFAULT_ALARM_SETTINGS, type AlarmSettings } from '@cookit/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorCode } from '@/lib/api';
import { ring, unlockAlarm } from '../model/player';
import { ALARM_QUERY_KEY, deviceAlarm, saveAccountAlarm } from '../model/settings';
import { useAlarmSettings } from './useAlarmSettings';

/**
 * The alarm page (`/account/alarm`): the account's settings (saved on the server, every device),
 * and this device's own if wanted (kept in this browser). "Listen" plays a setting as it is.
 */
export function useAlarmSettingsViewModel() {
  const queryClient = useQueryClient();
  const { userId, account, accountLoading, device } = useAlarmSettings();
  // The account form starts from what is saved; changes are kept until saved.
  const [draft, setDraft] = useState<AlarmSettings>();
  const accountForm = draft ?? account ?? DEFAULT_ALARM_SETTINGS;

  const save = useMutation({
    mutationFn: saveAccountAlarm,
    onSuccess: (saved) => {
      queryClient.setQueryData([...ALARM_QUERY_KEY, userId], saved);
      setDraft(undefined);
    },
  });

  return {
    loading: accountLoading,
    sounds: ALARM_SOUNDS,
    account: accountForm,
    accountChanged: draft !== undefined,
    changeAccount: (change: Partial<AlarmSettings>) => {
      save.reset();
      setDraft({ ...accountForm, ...change });
    },
    saveAccount: () => save.mutate(accountForm),
    saving: save.isPending,
    saved: save.isSuccess,
    saveError: save.isError ? errorCode(save.error) : undefined,

    /** This device has its own settings (undefined: the account's apply). */
    device,
    setOwnOnDevice: (own: boolean) => deviceAlarm.set(userId, own ? { ...accountForm } : undefined),
    changeDevice: (change: Partial<AlarmSettings>) => {
      if (device) deviceAlarm.set(userId, { ...device, ...change });
    },

    /** Plays the settings once (the click unlocks sound on this page). */
    listen: (settings: AlarmSettings) => {
      unlockAlarm();
      // The audio context starts on this gesture: play just after.
      setTimeout(() => ring(settings), 50);
    },
  };
}
