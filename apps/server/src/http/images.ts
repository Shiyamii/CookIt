import type { Context } from 'hono';

/**
 * Sends a stored picture. A URL always shows the same picture (a new one gets a new id), so a
 * picture anyone may see is kept by the browser for a year without asking again. One that
 * depends on the session (a private or unlisted recipe's photo) is checked again each time: an
 * unchanged picture is a 304, without its bytes. Never in shared caches (`private`).
 */
export function sendImage(
  c: Context,
  image: { contentType: string; data: Buffer; public: boolean },
  version: string,
) {
  const etag = `"${version}"`;
  const headers = {
    'Content-Disposition': 'inline',
    'Cache-Control': image.public ? 'private, max-age=31536000, immutable' : 'private, no-cache',
    ETag: etag,
  };
  if (c.req.header('if-none-match') === etag) return c.body(null, 304, headers);
  return c.body(new Uint8Array(image.data), 200, { ...headers, 'Content-Type': image.contentType });
}
