/**
 * The sound and vibration of a finished timer while the page is open (plan §5.3). Generated with
 * Web Audio (no sound file). Browsers only allow sound after a user gesture: `unlockAlarm` is
 * called when a timer is started.
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

/** Three short beeps, and a vibration where supported. */
export function playAlarm(): void {
  try {
    navigator.vibrate?.([300, 150, 300, 150, 300]);
  } catch {
    // Not supported.
  }
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  for (let i = 0; i < 3; i++) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start + i * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.4, start + i * 0.45 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.45 + 0.3);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + i * 0.45);
    oscillator.stop(start + i * 0.45 + 0.32);
  }
}
