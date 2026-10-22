import type { PushDevice, PushKeyResponse, PushSubscriptionInput } from '@cookit/shared';
import { apiDelete, apiGet, apiPost } from '@/lib/api';

/**
 * Web Push in the browser (plan §5.4): the service worker shows the notifications the server
 * sends when a timer ends; this device subscribes with the server's VAPID key. Notifications are
 * never scheduled in the browser.
 */

export const PUSH_QUERY_KEY = ['push'] as const;

export type PushStatus =
  /** No Web Push in this browser. */
  | 'unsupported'
  /** iPhone / iPad in Safari: only from the home screen (iOS 16.4+). */
  | 'ios_install'
  /** The server has no VAPID keys. */
  | 'not_configured'
  /** Blocked in the browser's site settings. */
  | 'denied'
  | 'off'
  | 'on';

export type BrowserPush = {
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  permission: NotificationPermission;
  /** This browser's subscription, if any. */
  endpoint: string | null;
};

export function pushStatus(browser: BrowserPush, configured: boolean): PushStatus {
  if (browser.ios && !browser.standalone && !browser.supported) return 'ios_install';
  if (!browser.supported) return 'unsupported';
  if (!configured) return 'not_configured';
  if (browser.permission === 'denied') return 'denied';
  return browser.permission === 'granted' && browser.endpoint ? 'on' : 'off';
}

/** iPhone, iPad (which says it is a Mac, but has touch). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** "Chrome · Android": enough to tell one's devices apart. */
export function deviceName(userAgent: string): string {
  const browser = (
    [
      [/Edg\//, 'Edge'],
      [/OPR\//, 'Opera'],
      [/SamsungBrowser\//, 'Samsung Internet'],
      [/Firefox\/|FxiOS\//, 'Firefox'],
      [/Chrome\/|CriOS\//, 'Chrome'],
      [/Safari\//, 'Safari'],
    ] as const
  ).find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = (
    [
      [/iPhone/, 'iPhone'],
      [/iPad/, 'iPad'],
      [/Android/, 'Android'],
      [/Windows/, 'Windows'],
      [/Mac OS X|Macintosh/, 'macOS'],
      [/CrOS/, 'ChromeOS'],
      [/Linux/, 'Linux'],
    ] as const
  ).find(([pattern]) => pattern.test(userAgent))?.[1];
  return [browser, system].filter(Boolean).join(' · ');
}

/** The VAPID public key (base64url) as `PushManager.subscribe` wants it. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array) =>
  !!a && a.byteLength === b.length && new Uint8Array(a).every((value, i) => value === b[i]);

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * The browser refused to subscribe (its push service is off or unreachable). Brave turns it off
 * by default: its users are told which setting to change.
 */
export class PushSubscribeError extends Error {
  constructor(readonly code: 'push_failed' | 'push_failed_brave') {
    super(code);
  }
}

async function isBrave(): Promise<boolean> {
  const brave = (navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  return (await brave?.isBrave?.().catch(() => false)) ?? false;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export const fetchPushKey = () => apiGet<PushKeyResponse>('/push/key');
export const fetchPushDevices = () =>
  apiGet<{ devices: PushDevice[] }>('/push/subscriptions').then((data) => data.devices);

const saveSubscription = (subscription: PushSubscription) =>
  apiPost('/push/subscriptions', subscription.toJSON() as PushSubscriptionInput);

/** The Permissions API when there is one (headless Chromium's `Notification.permission` lies). */
async function notificationPermission(): Promise<NotificationPermission> {
  try {
    const { state } = await navigator.permissions.query({ name: 'notifications' });
    return state === 'prompt' ? 'default' : state;
  } catch {
    return Notification.permission;
  }
}

/**
 * This browser's state. A subscription already granted is sent again: the server keeps it for
 * the signed-in account (the browser may have changed hands, or the endpoint changed).
 */
export async function readBrowserPush(configured: boolean): Promise<BrowserPush> {
  const ios = isIos(navigator.userAgent, navigator.maxTouchPoints);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!supported()) {
    return { supported: false, ios, standalone, permission: 'default', endpoint: null };
  }
  const subscription = await currentSubscription();
  const permission = await notificationPermission();
  if (subscription && configured && permission === 'granted') {
    await saveSubscription(subscription).catch(() => undefined);
  }
  return { supported: true, ios, standalone, permission, endpoint: subscription?.endpoint ?? null };
}

/** Asks for the permission (from a tap), subscribes with the server's key and saves it. */
export async function enablePush(publicKey: string): Promise<'on' | 'denied'> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let subscription = await registration.pushManager.getSubscription();
  // Subscribed with other keys (they were changed on the server): subscribe again.
  if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    } catch (error) {
      // The browser's own reason (e.g. "push service error"), for whoever opens the console.
      console.warn('Push subscription failed:', error);
      throw new PushSubscribeError((await isBrave()) ? 'push_failed_brave' : 'push_failed');
    }
  }
  await saveSubscription(subscription);
  return 'on';
}

/** Stops the notifications on this browser (server first: it needs the endpoint). */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await apiDelete('/push/subscriptions', { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

/**
 * At sign-out: this browser stops receiving the account's notifications (the next person here
 * must not get them). Never blocks the sign-out.
 */
export async function forgetPushSubscription(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  await apiDelete('/push/subscriptions', { endpoint: subscription.endpoint }).catch(() => {
    // Offline: once unsubscribed, the push service answers 410 and the server deletes it.
  });
  await subscription.unsubscribe().catch(() => false);
}

export const sendTestPush = () => apiPost<{ sent: number }>('/push/test');
