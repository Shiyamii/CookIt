import { z } from 'zod';

// The alarm of finished timers. Settings of the account apply everywhere; a device can have its
// own (a loud kitchen tablet, a phone that only vibrates). Sounds are synthesized in the browser.

export const ALARM_SOUNDS = ['classic', 'chime', 'bell', 'rising', 'soft'] as const;
export type AlarmSound = (typeof ALARM_SOUNDS)[number];

export const alarmSettingsSchema = z
  .object({
    sound: z.enum(ALARM_SOUNDS),
    /** 0 to 100. */
    volume: z.number().int().min(0).max(100),
    vibrate: z.boolean(),
    /**
     * Rings again until stopped (page open); for the account, also sends the notification again
     * (page closed).
     */
    repeat: z.boolean(),
  })
  .strict();
export type AlarmSettings = z.infer<typeof alarmSettingsSchema>;

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  sound: 'classic',
  volume: 80,
  vibrate: true,
  repeat: true,
};

/** A finished timer's notification is sent again this many times at most, until stopped. */
export const MAX_TIMER_REMINDERS = 10;
/** Time between two notifications of the same finished timer. */
export const TIMER_REMINDER_SECONDS = 30;
