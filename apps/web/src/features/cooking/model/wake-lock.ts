/**
 * Keeps the screen on while cooking (plan §5.3, Wake Lock API). The browser releases the lock
 * when the page is hidden: it is taken again when the page comes back. Not supported or refused
 * (battery saver): the cooking mode works anyway.
 */
export function keepScreenOn(): () => void {
  let lock: WakeLockSentinel | undefined;
  let stopped = false;

  const acquire = async () => {
    if (stopped || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      if (stopped) await lock.release();
    } catch {
      // Refused: nothing to do.
    }
  };
  const onVisible = () => void acquire();

  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => undefined);
  };
}
