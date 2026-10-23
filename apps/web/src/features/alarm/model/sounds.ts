import type { AlarmSound } from '@cookit/shared';

/**
 * The alarm sounds, synthesized with Web Audio (no sound file: nothing to download, works
 * offline). A sound is a list of tones; `player.ts` plays them.
 */

export type Tone = {
  /** Start, in seconds from the start of the sound. */
  at: number;
  frequency: number;
  /** Until the tone has faded out, in seconds. */
  duration: number;
  type: OscillatorType;
  /** Relative loudness, 0 to 1. */
  gain: number;
  /** Seconds to reach full loudness (short: a strike; longer: a soft start). */
  attack: number;
};

const tone = (
  at: number,
  frequency: number,
  duration: number,
  extra: Partial<Tone> = {},
): Tone => ({
  at,
  frequency,
  duration,
  type: 'sine',
  gain: 1,
  attack: 0.01,
  ...extra,
});

/** A bell: a few inharmonic partials of `frequency`, the high ones fading first. */
const bellStrike = (at: number, frequency: number, duration: number): Tone[] =>
  [
    [1, 1],
    [2, 0.5],
    [2.76, 0.35],
    [5.4, 0.2],
  ].map(([ratio, gain], index) =>
    tone(at, frequency * ratio!, duration / (index + 1) + 0.2, { gain: gain!, attack: 0.005 }),
  );

export const SOUNDS: Record<AlarmSound, Tone[]> = {
  // Three short beeps, like a kitchen timer.
  classic: [0, 0.3, 0.6].map((at) =>
    tone(at, 880, 0.2, { type: 'square', gain: 0.35, attack: 0.005 }),
  ),
  // Ding-dong: two notes with an octave above each.
  chime: [
    tone(0, 659.25, 1.1),
    tone(0, 1318.5, 0.6, { gain: 0.25 }),
    tone(0.5, 523.25, 1.4),
    tone(0.5, 1046.5, 0.7, { gain: 0.25 }),
  ],
  bell: [...bellStrike(0, 523.25, 1.8), ...bellStrike(0.9, 523.25, 1.8)],
  // Four notes going up, louder and louder.
  rising: [523.25, 659.25, 783.99, 1046.5].map((frequency, index) =>
    tone(index * 0.18, frequency, 0.3, { type: 'triangle', gain: 0.4 + index * 0.2 }),
  ),
  // Two quiet notes with a slow start.
  soft: [
    tone(0, 440, 0.7, { gain: 0.45, attack: 0.12 }),
    tone(0.45, 554.37, 0.8, { gain: 0.45, attack: 0.12 }),
  ],
};

/** How long a sound lasts, in milliseconds (its last tone faded out). */
export function soundDuration(sound: AlarmSound): number {
  return Math.round(Math.max(...SOUNDS[sound].map((item) => item.at + item.duration)) * 1000);
}

/** The vibration that goes with the sound. */
export const VIBRATION = [300, 150, 300, 150, 300];
