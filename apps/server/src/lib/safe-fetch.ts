import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

/**
 * Fetching a page given by a user (import by URL, plan §5.2) without letting it reach the
 * internal network (SSRF, plan §7): the instance may run on a private network.
 * - http(s) only, standard ports, no credentials in the URL;
 * - every address the name resolves to must be public (checked after DNS resolution), and the
 *   connection uses the checked address (no second resolution: no DNS rebinding);
 * - redirects are followed by hand, each one checked the same way (at most 3);
 * - a total timeout, a size limit, no compression (no decompression bomb), HTML only.
 */

export type FetchError =
  'invalid_url' | 'blocked_address' | 'fetch_failed' | 'too_large' | 'timeout' | 'not_html';

export class SafeFetchError extends Error {
  constructor(readonly code: FetchError) {
    super(code);
  }
}

export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(['', '80', '443']);

/** Addresses never fetched: loopback, private, link-local, shared, reserved, multicast… */
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/** True for an address that must not be fetched (IPv4-mapped IPv6 checked as IPv4). */
/** The 8 groups of 16 bits of an IPv6 address (`isIP` already said it is one). */
function ipv6Groups(address: string): number[] {
  let text = address.split('%')[0] ?? '';
  // An embedded IPv4 (`::ffff:1.2.3.4`) as two groups.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head = '', tail] = text.split('::');
  const parse = (part: string) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  return [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right];
}

/**
 * True for an address that must not be fetched. IPv6 addresses whose first 64 bits are zero are
 * all refused: `::`, `::1`, and every form embedding an IPv4 address (mapped `::ffff:a.b.c.d`,
 * compatible `::a.b.c.d`, translated `::ffff:0:a.b.c.d`, in dotted or hexadecimal form), whatever
 * that IPv4 address is. No public service lives there.
 */
export function isBlockedAddress(raw: string): boolean {
  // A zone (`fe80::1%eth0`) is not part of the address and would hide it from the block list.
  const address = raw.split('%')[0] ?? '';
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    if (
      ipv6Groups(address)
        .slice(0, 4)
        .every((group) => group === 0)
    )
      return true;
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

export type Resolver = (hostname: string) => Promise<LookupAddress[]>;
export type Transport = (url: URL, options: RequestOptions) => Promise<IncomingMessage>;

const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) =>
      error ? reject(error) : resolve(addresses),
    );
  });

const defaultTransport: Transport = (url, options) =>
  new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(url, options, resolve);
    req.on('error', reject);
    req.end();
  });

/** `promise`, or a `timeout` error as soon as `signal` aborts (DNS included in the time limit). */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(new SafeFetchError('timeout'));
    signal.addEventListener('abort', () => reject(new SafeFetchError('timeout')), { once: true });
    promise.then(resolve, reject);
  });
}

/** Checks a URL and returns it with the public address to connect to. */
async function checkTarget(
  raw: string,
  resolve: Resolver,
  signal: AbortSignal,
): Promise<{ url: URL; address: LookupAddress }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new SafeFetchError('invalid_url');
  if (url.username || url.password || !ALLOWED_PORTS.has(url.port)) {
    throw new SafeFetchError('invalid_url');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: LookupAddress[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await withSignal(resolve(hostname), signal);
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError('fetch_failed');
  }
  // Every address must be public: a name with one internal address is refused.
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new SafeFetchError('blocked_address');
  }
  return { url, address: addresses[0] as LookupAddress };
}

/** Reads the body up to MAX_PAGE_BYTES. */
async function readBody(response: IncomingMessage): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) {
    response.destroy();
    throw new SafeFetchError('too_large');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_PAGE_BYTES) {
      response.destroy();
      throw new SafeFetchError('too_large');
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function decode(body: Buffer, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8';
  try {
    // Any WHATWG label works at runtime (an unknown one throws: utf-8 then); the type only lists
    // a few.
    return new TextDecoder(charset as 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

/** An HTML page from the web: its text and the final URL (after redirects). */
export async function safeFetchHtml(
  raw: string,
  deps: { resolve?: Resolver; transport?: Transport; timeoutMs?: number } = {},
): Promise<{ url: string; html: string }> {
  const resolve = deps.resolve ?? defaultResolver;
  const transport = deps.transport ?? defaultTransport;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TIMEOUT_MS);
  try {
    let next = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const { url, address } = await checkTarget(next, resolve, controller.signal);
      let response: IncomingMessage;
      try {
        response = await transport(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Encoding': 'identity',
            'User-Agent': 'CookIt recipe import',
          },
          // Connect to the address checked above, never to a new resolution of the name.
          lookup: (_hostname, options, callback) => {
            if ((options as { all?: boolean }).all) callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        });
      } catch {
        throw new SafeFetchError(controller.signal.aborted ? 'timeout' : 'fetch_failed');
      }
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.destroy();
        try {
          next = new URL(response.headers.location, url).href;
        } catch {
          throw new SafeFetchError('invalid_url');
        }
        continue;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        throw new SafeFetchError('fetch_failed');
      }
      const encoding = response.headers['content-encoding'];
      const type = response.headers['content-type'] ?? '';
      if (
        (encoding && encoding !== 'identity') ||
        !/text\/html|application\/xhtml\+xml/i.test(type)
      ) {
        response.destroy();
        throw new SafeFetchError(encoding && encoding !== 'identity' ? 'fetch_failed' : 'not_html');
      }
      try {
        return { url: url.href, html: decode(await readBody(response), type) };
      } catch (error) {
        if (error instanceof SafeFetchError) throw error;
        throw new SafeFetchError(controller.signal.aborted ? 'timeout' : 'fetch_failed');
      }
    }
    throw new SafeFetchError('fetch_failed');
  } finally {
    clearTimeout(timer);
    // Whatever happened, nothing keeps downloading after the import answered.
    controller.abort();
  }
}
