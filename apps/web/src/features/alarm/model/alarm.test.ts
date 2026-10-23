import { describe, expect, test } from 'bun:test';
import { ALARM_SOUNDS, DEFAULT_ALARM_SETTINGS, type AlarmSettings } from '@cookit/shared';
import {
  GIVE_UP_MS,
  LOOP_MS,
  nextRingDelay,
  PAUSE_MS,
  shouldRing,
  SLOW_EVERY_MS,
} from './schedule';
import { effectiveAlarm } from './settings';
import { SOUNDS, soundDuration } from './sounds';

describe('sounds', () => {
  test('every sound exists, is short, and stays within the loudness range', () => {
    for (const sound of ALARM_SOUNDS) {
      const tones = SOUNDS[sound];
      expect(tones.length).toBeGreaterThan(0);
      expect(soundDuration(sound)).toBeGreaterThan(200);
      expect(soundDuration(sound)).toBeLessThan(4000);
      for (const tone of tones) {
        expect(tone.gain).toBeGreaterThan(0);
        expect(tone.gain).toBeLessThanOrEqual(1);
        expect(tone.attack).toBeLessThan(tone.duration);
        expect(tone.frequency).toBeGreaterThan(100);
        expect(tone.frequency).toBeLessThan(6000);
      }
    }
  });

  test('a sound lasts until its last tone faded out', () => {
    expect(soundDuration('classic')).toBe(800);
  });
});

describe('ring schedule', () => {
  const sound = 1000;

  test('a loop during the first minutes, then every 30 s, then nothing', () => {
    expect(nextRingDelay(0, sound)).toBe(sound + PAUSE_MS);
    expect(nextRingDelay(LOOP_MS - 1, sound)).toBe(sound + PAUSE_MS);
    expect(nextRingDelay(LOOP_MS, sound)).toBe(SLOW_EVERY_MS);
    expect(nextRingDelay(GIVE_UP_MS - 1, sound)).toBe(SLOW_EVERY_MS);
    expect(nextRingDelay(GIVE_UP_MS, sound)).toBeUndefined();
  });

  const at = (now: number, lastRingAt?: number, repeat = true) =>
    shouldRing({ now, finishedAt: 0, lastRingAt, soundMs: sound, repeat });

  test('rings at once, then again after the sound and a pause', () => {
    expect(at(0)).toBe(true);
    expect(at(2000, 0)).toBe(false);
    expect(at(sound + PAUSE_MS, 0)).toBe(true);
  });

  test('slower after the loop, never after giving up', () => {
    expect(at(LOOP_MS + 10_000, LOOP_MS)).toBe(false);
    expect(at(LOOP_MS + SLOW_EVERY_MS, LOOP_MS)).toBe(true);
    expect(at(GIVE_UP_MS)).toBe(false);
    expect(at(GIVE_UP_MS + 60_000, GIVE_UP_MS - 60_000)).toBe(false);
  });

  test('without repeat, once', () => {
    expect(at(0, undefined, false)).toBe(true);
    expect(at(60_000, 0, false)).toBe(false);
  });

  test('not before the timer finished', () => {
    expect(at(-1)).toBe(false);
  });
});

describe('settings that apply', () => {
  const account: AlarmSettings = { sound: 'bell', volume: 50, vibrate: true, repeat: true };
  const device: AlarmSettings = { sound: 'soft', volume: 100, vibrate: false, repeat: false };

  test("this device's own, else the account's, else the defaults", () => {
    expect(effectiveAlarm(account, device)).toBe(device);
    expect(effectiveAlarm(account, undefined)).toBe(account);
    expect(effectiveAlarm(undefined, undefined)).toBe(DEFAULT_ALARM_SETTINGS);
  });
});
