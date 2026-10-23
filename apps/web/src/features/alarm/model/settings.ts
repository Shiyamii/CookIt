import { alarmSettingsSchema, DEFAULT_ALARM_SETTINGS, type AlarmSettings } from '@cookit/shared';
import { apiGet, apiPut } from '@/lib/api';

/**
 * Alarm settings: the account's (saved on the server, the same on every device) and, if this
 * device has its own, the device's (kept in this browser only: a loud kitchen tablet, a phone
 * that only vibrates).
 */

export const ALARM_QUERY_KEY = ['alarm', 'account'] as const;

export const fetchAccountAlarm = () => apiGet<AlarmSettings>('/me/alarm');
export const saveAccountAlarm = (settings: AlarmSettings) =>
  apiPut<AlarmSettings>('/me/alarm', settings);

/** What applies on this device. */
export function effectiveAlarm(
  account: AlarmSettings | undefined,
  device: AlarmSettings | undefined,
): AlarmSettings {
  return device ?? account ?? DEFAULT_ALARM_SETTINGS;
}

const PREFIX = 'cookit:alarm-device:';
const listeners = new Set<() => void>();
const cache = new Map<string, AlarmSettings | undefined>();

function read(userId: string): AlarmSettings | undefined {
  try {
    const value = localStorage.getItem(PREFIX + userId);
    if (!value) return undefined;
    const parsed = alarmSettingsSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** This device's own settings, per user (undefined: the account's apply). */
export const deviceAlarm = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get(userId: string): AlarmSettings | undefined {
    if (!cache.has(userId)) cache.set(userId, read(userId));
    return cache.get(userId);
  },
  set(userId: string, settings: AlarmSettings | undefined) {
    cache.set(userId, settings);
    try {
      if (settings) localStorage.setItem(PREFIX + userId, JSON.stringify(settings));
      else localStorage.removeItem(PREFIX + userId);
    } catch {
      // Not kept after a reload: the account's settings apply then.
    }
    for (const listener of listeners) listener();
  },
};
