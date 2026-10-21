import type { PushDevice, PushPayload, PushSubscriptionInput } from '@cookit/shared';
import type { PushResult, PushSender } from '../../lib/web-push';
import type { DueTimer, PushRepository, StoredSubscription } from './push.repository';

/** Browsers kept per user: the most recent ones. */
export const MAX_SUBSCRIPTIONS_PER_USER = 10;
/** Timers handled per scheduler run (the next run takes the rest). */
export const BATCH = 50;
/** Timers sent per user and run: the others wait for the next run (~5 s), so one account
 * re-arming many timers cannot flood the push services. */
export const MAX_SENT_PER_USER = 10;
/** A claim not confirmed within this time (crash while sending) is taken again. */
const LEASE_SECONDS = 120;
/** A notification the device could not get within 10 minutes is no longer worth showing. */
const TTL_SECONDS = 600;

const FINISHED: Record<string, string> = { fr: 'Minuteur terminé', en: 'Timer finished' };
const TEST: Record<string, { title: string; body: string }> = {
  fr: { title: 'CookIt', body: 'Les notifications fonctionnent sur cet appareil.' },
  en: { title: 'CookIt', body: 'Notifications work on this device.' },
};

/** What a finished timer shows: the dish, then the timer's name (plan §5.4). */
export function timerPayload(timer: DueTimer): PushPayload {
  return {
    title: timer.recipeTitle || 'CookIt',
    body: timer.label || (FINISHED[timer.locale] ?? FINISHED.en!),
    url: timer.recipeId ? `/cook?show=${encodeURIComponent(timer.recipeId)}` : '/cook',
    tag: `timer-${timer.id}`,
  };
}

/**
 * Web Push (plan §5.4): browsers' subscriptions, and the scheduler run that notifies finished
 * timers. Without VAPID keys (`sender` undefined) push is off: timers are still marked done.
 */
export function createPushService(deps: {
  repository: PushRepository;
  sender?: PushSender;
  publicKey?: string;
  /** Accepts the subscription's endpoint (push services only). */
  isPushEndpoint: (endpoint: string) => boolean;
  now?: () => Date;
  newId?: () => string;
  log?: (message: string) => void;
}) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const log = deps.log ?? ((message: string) => console.warn(message));

  /** Sends to every subscription; dead ones are deleted. Returns how many got it. */
  const sendAll = async (subscriptions: StoredSubscription[], payload: PushPayload) => {
    if (!deps.sender) return 0;
    const sender = deps.sender;
    const body = JSON.stringify(payload);
    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        const result = await sender(subscription, body, { ttlSeconds: TTL_SECONDS }).catch(
          (): PushResult => ({ ok: false, gone: false }),
        );
        if (!result.ok && result.gone) await deps.repository.deleteById(subscription.id);
        else if (!result.ok) {
          // The host only: the endpoint itself is a secret capability URL.
          log(
            `Push to ${new URL(subscription.endpoint).host} failed (${result.status ?? 'network'})`,
          );
        }
        return result.ok;
      }),
    );
    return results.filter(Boolean).length;
  };

  return {
    publicKey: (): string | null => (deps.sender && deps.publicKey) || null,

    async subscribe(
      userId: string,
      input: PushSubscriptionInput,
      userAgent: string,
    ): Promise<{ ok: true } | { error: 'unsupported_push_service' | 'push_not_configured' }> {
      if (!deps.sender) return { error: 'push_not_configured' };
      if (!deps.isPushEndpoint(input.endpoint)) return { error: 'unsupported_push_service' };
      await deps.repository.upsert(
        userId,
        {
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: Array.from(userAgent).slice(0, 300).join(''),
        },
        { now: now(), newId: newId() },
      );
      await deps.repository.prune(userId, MAX_SUBSCRIPTIONS_PER_USER);
      return { ok: true };
    },

    async unsubscribe(userId: string, endpoint: string): Promise<void> {
      await deps.repository.delete(userId, endpoint);
    },

    async devices(userId: string): Promise<PushDevice[]> {
      const rows = await deps.repository.list(userId);
      return rows.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      }));
    },

    /** A notification to every device of the user ("Send a test"). */
    async sendTest(userId: string, locale: string): Promise<{ sent: number }> {
      const text = TEST[locale] ?? TEST.en!;
      const subscriptions = await deps.repository.list(userId);
      const sent = await sendAll(subscriptions, {
        ...text,
        url: '/account/notifications',
        tag: 'test',
      });
      return { sent };
    },

    /**
     * One scheduler run: notifies the timers whose end has come, to every device of their user.
     * Not sent (only marked done): timers of disabled users, and timers that had already ended
     * when the server learnt of them (started offline; the device rang itself). Sends happen
     * outside any transaction, all timers of the run at once.
     */
    async notifyDue(): Promise<number> {
      const due = await deps.repository.claimDue(BATCH, LEASE_SECONDS);
      const lists = new Map<string, Promise<StoredSubscription[]>>();
      const perUser = new Map<string, number>();
      const later: DueTimer[] = [];
      const handled: DueTimer[] = [];
      for (const timer of due) {
        const count = perUser.get(timer.userId) ?? 0;
        if (count >= MAX_SENT_PER_USER) later.push(timer);
        else {
          perUser.set(timer.userId, count + 1);
          handled.push(timer);
        }
      }
      await Promise.all(
        handled.map(async (timer) => {
          if (timer.userDisabled || timer.endsAt <= timer.createdAt) return;
          let subscriptions = lists.get(timer.userId);
          if (!subscriptions) {
            subscriptions = deps.repository.list(timer.userId);
            lists.set(timer.userId, subscriptions);
          }
          await sendAll(await subscriptions, timerPayload(timer));
        }),
      );
      await deps.repository.markNotified(handled);
      if (later.length) await deps.repository.release(later);
      return due.length;
    },
  };
}

export type PushService = ReturnType<typeof createPushService>;
