import { describe, expect, test } from 'bun:test';
import {
  ALARM_SOUNDS,
  alarmSettingsSchema,
  DEFAULT_ALARM_SETTINGS,
  MAX_TIMER_REMINDERS,
  TIMER_REMINDER_SECONDS,
} from './alarm';

describe('alarm settings schema', () => {
  const valid = { sound: 'bell', volume: 50, vibrate: false, repeat: true };

  test('the defaults are valid', () => {
    expect(alarmSettingsSchema.parse(DEFAULT_ALARM_SETTINGS)).toEqual(DEFAULT_ALARM_SETTINGS);
  });

  test('every sound is accepted', () => {
    for (const sound of ALARM_SOUNDS) {
      expect(alarmSettingsSchema.safeParse({ ...valid, sound }).success).toBe(true);
    }
  });

  test('volume is an integer from 0 to 100', () => {
    for (const volume of [0, 100]) {
      expect(alarmSettingsSchema.safeParse({ ...valid, volume }).success).toBe(true);
    }
    for (const volume of [-1, 101, 50.5, '50', null, Number.NaN]) {
      expect(alarmSettingsSchema.safeParse({ ...valid, volume }).success).toBe(false);
    }
  });

  test('unknown sound, missing field and extra field are refused', () => {
    expect(alarmSettingsSchema.safeParse({ ...valid, sound: 'siren' }).success).toBe(false);
    expect(alarmSettingsSchema.safeParse({ sound: 'bell', volume: 50 }).success).toBe(false);
    expect(alarmSettingsSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(alarmSettingsSchema.safeParse({ ...valid, vibrate: 'yes' }).success).toBe(false);
  });

  test('reminder constants are sane', () => {
    expect(MAX_TIMER_REMINDERS).toBeGreaterThan(0);
    expect(TIMER_REMINDER_SECONDS).toBeGreaterThan(0);
  });
});
