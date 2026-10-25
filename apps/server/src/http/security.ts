import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { env } from '../env';

/** Largest accepted request body (a recipe document is at most ~200 000 characters). */
export const MAX_BODY_BYTES = 1024 * 1024;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection: a state-changing API request must come from our own origin. Browsers always
 * send `Origin` on such requests; `Sec-Fetch-Site` covers the rare ones that don't.
 */
export function sameOrigin(): MiddlewareHandler {
  return async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      const site = c.req.header('sec-fetch-site');
      const allowed = origin ? origin === env.ORIGIN : site === 'same-origin';
      if (!allowed) return c.json({ error: 'forbidden_origin' }, 403);
    }
    await next();
  };
}

/** API answers depend on the session: no browser, proxy or service-worker cache may keep them. */
export function noStore(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  };
}

/**
 * Browser caching of the SPA: built files have a content hash in their name (`/assets/`), so they
 * never change; everything else (index.html, the service worker, the manifest, icons) is checked
 * again each time, so a new version is picked up at once.
 */
export function staticCaching(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/') || c.res.status !== 200) return;
    c.header(
      'Cache-Control',
      c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    );
  };
}

export function apiBodyLimit(): MiddlewareHandler {
  return bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  });
}

/**
 * Security headers and a strict CSP: the SPA only loads its own scripts, styles and fonts.
 * Uploaded pictures (`/images/`) get a CSP that allows nothing, sandboxed: opened as a document,
 * whatever bytes follow their header can never run.
 */
export function securityHeaders(): MiddlewareHandler {
  const app = appHeaders();
  const images = secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'none'"], sandbox: [] },
    referrerPolicy: 'no-referrer',
    strictTransportSecurity: hsts(),
  });
  return (c, next) => (c.req.path.startsWith('/images/') ? images(c, next) : app(c, next));
}

const hsts = () =>
  env.ORIGIN.startsWith('https://') ? 'max-age=31536000; includeSubDomains' : false;

function appHeaders(): MiddlewareHandler {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Radix positions popovers with inline `style` attributes.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      // Vite inlines the smallest font subsets as `data:` URLs.
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    strictTransportSecurity: hsts(),
    // Features the app never uses (the screen wake lock of the cooking mode stays allowed).
    permissionsPolicy: {
      camera: false,
      microphone: false,
      geolocation: false,
      payment: false,
      usb: false,
    },
  });
}
