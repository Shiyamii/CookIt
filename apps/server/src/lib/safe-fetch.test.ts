import { describe, expect, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import {
  isBlockedAddress,
  MAX_PAGE_BYTES,
  safeFetchHtml,
  type Resolver,
  type Transport,
} from './safe-fetch';

/** A fake response: status, headers and body. */
function response(status: number, headers: Record<string, string>, body = ''): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
  stream.statusCode = status;
  stream.headers = headers;
  return stream;
}

const publicDns: Resolver = async (host) => {
  if (host === 'internal.example') return [{ address: '10.0.0.5', family: 4 }];
  if (host === 'mixed.example') {
    return [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];
  }
  return [{ address: '93.184.216.34', family: 4 }];
};

const html = '<html><script type="application/ld+json">{}</script></html>';

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('isBlockedAddress', () => {
  test('internal, loopback, link-local and reserved addresses are blocked', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '255.255.255.255',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
      '::ffff:7f00:1',
      '::7f00:1',
      '::127.0.0.1',
      '::ffff:0:7f00:1',
      '::ffff:0:127.0.0.1',
      '::ffff:8.8.8.8',
      'fe80::1%eth0',
      'fe80::1%25eth0',
      'not an ip',
    ]) {
      expect(isBlockedAddress(address)).toBe(true);
    }
  });

  test('public addresses are allowed', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });
});

describe('safeFetchHtml', () => {
  const ok: Transport = async () =>
    response(200, { 'content-type': 'text/html; charset=utf-8' }, html);

  test('refuses other schemes, ports and credentials', async () => {
    for (const url of [
      'ftp://example.com/',
      'file:///etc/passwd',
      'http://example.com:8080/',
      'http://user:pass@example.com/',
      'not a url',
    ]) {
      expect(await code(safeFetchHtml(url, { resolve: publicDns, transport: ok }))).toBe(
        'invalid_url',
      );
    }
  });

  test('refuses internal addresses, literal or resolved, and names with one internal address', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://192.168.0.10/',
      'http://internal.example/',
      'http://mixed.example/',
    ]) {
      expect(await code(safeFetchHtml(url, { resolve: publicDns, transport: ok }))).toBe(
        'blocked_address',
      );
    }
  });

  test('connects to the checked address, and returns the page', async () => {
    let connected = '';
    const transport: Transport = async (_url, options) => {
      await new Promise<void>((done) =>
        options.lookup?.('example.com', {}, (_error, address) => {
          connected = String(address);
          done();
        }),
      );
      return response(200, { 'content-type': 'text/html' }, html);
    };
    const page = await safeFetchHtml('https://example.com/recipe', {
      resolve: publicDns,
      transport,
    });
    expect(page).toEqual({ url: 'https://example.com/recipe', html });
    expect(connected).toBe('93.184.216.34');
  });

  test('a redirect to an internal address is refused; redirects are limited', async () => {
    const toInternal: Transport = async () =>
      response(302, { location: 'http://169.254.169.254/latest/meta-data/' });
    expect(
      await code(
        safeFetchHtml('http://example.com/', { resolve: publicDns, transport: toInternal }),
      ),
    ).toBe('blocked_address');
    const loop: Transport = async () => response(301, { location: '/again' });
    expect(
      await code(safeFetchHtml('http://example.com/', { resolve: publicDns, transport: loop })),
    ).toBe('fetch_failed');
  });

  test('too large, compressed or non-HTML pages are refused', async () => {
    const big: Transport = async () =>
      response(200, { 'content-type': 'text/html' }, 'x'.repeat(MAX_PAGE_BYTES + 1));
    const declared: Transport = async () =>
      response(200, { 'content-type': 'text/html', 'content-length': String(10 ** 9) });
    const gzip: Transport = async () =>
      response(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }, 'x');
    const json: Transport = async () => response(200, { 'content-type': 'application/json' }, '{}');
    const at = 'http://example.com/';
    expect(await code(safeFetchHtml(at, { resolve: publicDns, transport: big }))).toBe('too_large');
    expect(await code(safeFetchHtml(at, { resolve: publicDns, transport: declared }))).toBe(
      'too_large',
    );
    expect(await code(safeFetchHtml(at, { resolve: publicDns, transport: gzip }))).toBe(
      'fetch_failed',
    );
    expect(await code(safeFetchHtml(at, { resolve: publicDns, transport: json }))).toBe('not_html');
  });
});
