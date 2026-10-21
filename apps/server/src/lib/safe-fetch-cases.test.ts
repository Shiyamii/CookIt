import { describe, expect, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { isBlockedAddress, safeFetchHtml, type Resolver, type Transport } from './safe-fetch';

function response(status: number, headers: Record<string, string>, body = ''): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = headers;
  return stream;
}

const publicDns: Resolver = async () => [{ address: '93.184.216.34', family: 4 }];
const htmlHeaders = { 'content-type': 'text/html' };

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('isBlockedAddress: more ranges', () => {
  test.each([
    'fc00::1',
    'fdff:ffff::1',
    'fe80::abcd',
    'fec0::1',
    'ff02::1',
    '2001:db8::1',
    '64:ff9b::7f00:1',
    '::ffff:10.0.0.1',
    '::7f00:1',
    '::ffff:0:127.0.0.1',
    '::ffff:8.8.8.8',
    'fe80::1%eth0',
    '::1%lo',
    '::ffff:192.168.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '240.0.0.1',
    '192.0.2.1',
    '',
  ])('%j is blocked', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  test.each(['2606:4700:4700::1111', '2a00:1450:4007::200e', '1.1.1.1'])(
    '%j is allowed',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('safeFetchHtml: more cases', () => {
  test('a public IPv6 literal is allowed, a fc00 one is refused', async () => {
    const ok: Transport = async () => response(200, htmlHeaders, 'hi');
    const page = await safeFetchHtml('http://[2606:4700:4700::1111]/', { transport: ok });
    expect(page.html).toBe('hi');
    expect(await code(safeFetchHtml('http://[fc00::1]/', { transport: ok }))).toBe(
      'blocked_address',
    );
    expect(await code(safeFetchHtml('http://[::ffff:127.0.0.1]/', { transport: ok }))).toBe(
      'blocked_address',
    );
  });

  test('a name resolving to an internal IPv6 address is refused', async () => {
    const resolve: Resolver = async () => [{ address: 'fd12::1', family: 6 }];
    const ok: Transport = async () => response(200, htmlHeaders);
    expect(await code(safeFetchHtml('http://v6.example/', { resolve, transport: ok }))).toBe(
      'blocked_address',
    );
  });

  test('a name without any address is refused', async () => {
    const resolve: Resolver = async () => [];
    const ok: Transport = async () => response(200, htmlHeaders);
    expect(await code(safeFetchHtml('http://none.example/', { resolve, transport: ok }))).toBe(
      'blocked_address',
    );
  });

  test('a DNS failure is fetch_failed', async () => {
    const resolve: Resolver = async () => {
      throw new Error('ENOTFOUND');
    };
    const ok: Transport = async () => response(200, htmlHeaders);
    expect(await code(safeFetchHtml('http://nope.example/', { resolve, transport: ok }))).toBe(
      'fetch_failed',
    );
  });

  test('a transport error is fetch_failed', async () => {
    const broken: Transport = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport: broken })),
    ).toBe('fetch_failed');
  });

  test.each([404, 500, 403, 100])('status %d is fetch_failed', async (status) => {
    const transport: Transport = async () => response(status, htmlHeaders, 'x');
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport })),
    ).toBe('fetch_failed');
  });

  test('a request that never answers ends in timeout', async () => {
    const hang: Transport = (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const started = Date.now();
    expect(
      await code(
        safeFetchHtml('http://example.com/', {
          resolve: publicDns,
          transport: hang,
          timeoutMs: 30,
        }),
      ),
    ).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test('a relative redirect is followed on the same host, and the final URL is returned', async () => {
    const urls: string[] = [];
    const transport: Transport = async (url) => {
      urls.push(url.href);
      return url.pathname === '/old'
        ? response(301, { location: '/new/page?x=1' })
        : response(200, htmlHeaders, 'final');
    };
    const page = await safeFetchHtml('https://example.com/old', {
      resolve: publicDns,
      transport,
    });
    expect(urls).toEqual(['https://example.com/old', 'https://example.com/new/page?x=1']);
    expect(page).toEqual({ url: 'https://example.com/new/page?x=1', html: 'final' });
  });

  test('three redirects are followed, a fourth is refused', async () => {
    let hops = 0;
    const transport: Transport = async () => {
      hops++;
      return hops <= 3
        ? response(302, { location: `/h${hops}` })
        : response(200, htmlHeaders, 'done');
    };
    expect(
      (await safeFetchHtml('http://example.com/', { resolve: publicDns, transport })).html,
    ).toBe('done');
    const endless: Transport = async () => response(302, { location: '/x' });
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport: endless })),
    ).toBe('fetch_failed');
  });

  test('a redirect to a non-http scheme or a port is refused', async () => {
    for (const location of ['file:///etc/passwd', 'http://example.com:22/', 'ftp://example.com/']) {
      const transport: Transport = async () => response(302, { location });
      expect(
        await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport })),
      ).toBe('invalid_url');
    }
  });

  test('a redirect to a name resolving to an internal address is refused', async () => {
    const resolve: Resolver = async (host) =>
      host === 'evil.example'
        ? [{ address: '10.0.0.1', family: 4 }]
        : [{ address: '93.184.216.34', family: 4 }];
    const transport: Transport = async () => response(302, { location: 'http://evil.example/' });
    expect(await code(safeFetchHtml('http://example.com/', { resolve, transport }))).toBe(
      'blocked_address',
    );
  });

  test('requests ask for identity encoding and send no cookies or credentials', async () => {
    let headers: Record<string, unknown> = {};
    const transport: Transport = async (_url, options) => {
      headers = (options.headers ?? {}) as Record<string, unknown>;
      return response(200, htmlHeaders, 'x');
    };
    await safeFetchHtml('http://example.com/', { resolve: publicDns, transport });
    expect(headers['Accept-Encoding']).toBe('identity');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  test('the declared charset is used to decode the page', async () => {
    const latin1 = Buffer.from('café', 'latin1');
    const transport: Transport = async () => {
      const stream = Readable.from([latin1]) as unknown as IncomingMessage;
      stream.statusCode = 200;
      stream.headers = { 'content-type': 'text/html; charset=iso-8859-1' };
      return stream;
    };
    const page = await safeFetchHtml('http://example.com/', { resolve: publicDns, transport });
    expect(page.html).toBe('café');
  });

  test('an unknown charset falls back to utf-8', async () => {
    const transport: Transport = async () =>
      response(200, { 'content-type': 'text/html; charset=nonsense' }, 'café');
    const page = await safeFetchHtml('http://example.com/', { resolve: publicDns, transport });
    expect(page.html).toBe('café');
  });

  test('xhtml is accepted, an image is not', async () => {
    const xhtml: Transport = async () =>
      response(200, { 'content-type': 'application/xhtml+xml' }, '<a/>');
    expect(
      (await safeFetchHtml('http://example.com/', { resolve: publicDns, transport: xhtml })).html,
    ).toBe('<a/>');
    const png: Transport = async () => response(200, { 'content-type': 'image/png' }, 'x');
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport: png })),
    ).toBe('not_html');
  });
});

describe('safeFetchHtml: hostile or slow infrastructure', () => {
  test('a resolver that never answers ends in timeout', async () => {
    const resolve: Resolver = () => new Promise(() => {});
    const ok: Transport = async () => response(200, htmlHeaders, 'x');
    expect(
      await code(safeFetchHtml('http://slow.example/', { resolve, transport: ok, timeoutMs: 30 })),
    ).toBe('timeout');
  });

  test('a malformed Location header is invalid_url', async () => {
    const transport: Transport = async () => response(302, { location: 'http://[bad' });
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport })),
    ).toBe('invalid_url');
  });
});
