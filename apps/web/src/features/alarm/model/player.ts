import type { AlarmSettings, AlarmSound } from '@cookit/shared';
import { SOUNDS, VIBRATION } from './sounds';

/**
 * Plays the alarm while a page is open (plan §5.3). Browsers only allow sound after a user
 * gesture: `unlockAlarm` is called on the first touch of the page and when a timer is started.
 */

let context: AudioContext | undefined;

export function unlockAlarm(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
  } catch {
    // No Web Audio: vibration only.
  }
}

/** One sound at `volume` (0 to 100). */
export function playSound(sound: AlarmSound, volume: number): void {
  if (!context || context.state !== 'running' || volume <= 0) return;
  const start = context.currentTime + 0.02;
  const master = context.createGain();
  // Several tones may play at once: keep the sum below clipping.
  master.gain.value = (volume / 100) * 0.5;
  master.connect(context.destination);
  for (const tone of SOUNDS[sound]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type;
    oscillator.frequency.value = tone.frequency;
    const begin = start + tone.at;
    gain.gain.setValueAtTime(0.0001, begin);
    gain.gain.exponentialRampToValueAtTime(tone.gain, begin + tone.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, begin + tone.duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(begin);
    oscillator.stop(begin + tone.duration + 0.02);
  }
}

/** The alarm once: its sound, and a vibration if wanted and supported. */
export function ring(settings: AlarmSettings): void {
  if (settings.vibrate) {
    try {
      navigator.vibrate?.(VIBRATION);
    } catch {
      // Not supported.
    }
  }
  playSound(settings.sound, settings.volume);
}
