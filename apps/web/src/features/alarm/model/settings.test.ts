import { beforeEach, describe, expect, test } from 'bun:test';
import type { AlarmSettings } from '@cookit/shared';
import { deviceAlarm } from './settings';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};

const settings: AlarmSettings = { sound: 'soft', volume: 30, vibrate: false, repeat: false };

describe('device alarm store', () => {
  beforeEach(() => store.clear());

  test('set is kept per user, notifies, and can be removed', () => {
    let calls = 0;
    const off = deviceAlarm.subscribe(() => calls++);
    deviceAlarm.set('a', settings);
    expect(deviceAlarm.get('a')).toEqual(settings);
    expect(deviceAlarm.get('b')).toBeUndefined();
    expect(JSON.parse(store.get('cookit:alarm-device:a')!)).toEqual(settings);
    deviceAlarm.set('a', undefined);
    expect(deviceAlarm.get('a')).toBeUndefined();
    expect(store.size).toBe(0);
    expect(calls).toBe(2);
    off();
    deviceAlarm.set('a', settings);
    expect(calls).toBe(2);
  });

  test('stored garbage or invalid settings read as no device settings', () => {
    store.set('cookit:alarm-device:bad-json', '{nope');
    store.set('cookit:alarm-device:bad-shape', JSON.stringify({ sound: 'siren' }));
    expect(deviceAlarm.get('bad-json')).toBeUndefined();
    expect(deviceAlarm.get('bad-shape')).toBeUndefined();
  });

  test('valid stored settings are read', () => {
    store.set('cookit:alarm-device:ok', JSON.stringify(settings));
    expect(deviceAlarm.get('ok')).toEqual(settings);
  });
});
