/**
 * Server time on the client (plan §5.3: "décalage d'horloge serveur/client corrigé"). Timers end
 * at an absolute server time; the remaining time is computed at display from the corrected clock,
 * never stored.
 */

/**
 * Offset to add to the device clock to get the server's, from one request: the server time is
 * taken as read halfway between sending and receiving.
 */
export function clockOffset(sentAt: number, receivedAt: number, serverNow: string): number {
  const server = Date.parse(serverNow);
  if (Number.isNaN(server) || receivedAt < sentAt) return 0;
  return Math.round(server - (sentAt + receivedAt) / 2);
}

/** Whole seconds left until `endsAt` (negative once finished), at server time `now`. */
export function remainingSeconds(endsAt: string, now: number): number {
  return Math.ceil((Date.parse(endsAt) - now) / 1000);
}

/** `1:05:09`, `4:07`, `0:09`: what a countdown shows. Finished timers show `0:00`. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}
