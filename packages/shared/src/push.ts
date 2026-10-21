import { z } from 'zod';

// Web Push (plan §5.4, phase 8): the browser's subscription is stored by the server, which sends
// a notification when a timer ends, even when every page is closed.

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

/** `PushSubscription.toJSON()`, as the browser gives it. */
export const pushSubscriptionInputSchema = z
  .object({
    endpoint: z.url({ protocol: /^https?$/ }).max(2048),
    expirationTime: z.number().nullable().optional(),
    keys: z
      .object({
        // An uncompressed P-256 public key (65 bytes) and a 16-byte secret, base64url.
        p256dh: base64url(80, 100),
        auth: base64url(16, 32),
      })
      .strict(),
  })
  .strict();
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;

export const pushUnsubscribeInputSchema = z
  .object({ endpoint: z.url({ protocol: /^https?$/ }).max(2048) })
  .strict();

/** `GET /api/v1/push/key`: null when the server has no VAPID keys (push turned off). */
export type PushKeyResponse = { publicKey: string | null };

/** A device of the user that receives notifications. */
export type PushDevice = { id: string; endpoint: string; userAgent: string; createdAt: string };

/** What the service worker receives (encrypted) and shows. */
export type PushPayload = {
  title: string;
  body: string;
  /** Same-origin path opened by a tap on the notification. */
  url: string;
  /** One notification per timer (a new one replaces it). */
  tag: string;
};

export const PUSH_ERRORS = ['unsupported_push_service', 'push_not_configured'] as const;
