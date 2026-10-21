import { describe, expect, test } from 'bun:test';
import { deviceName, isIos, keyBytes, pushStatus, type BrowserPush } from './push';

const browser = (overrides: Partial<BrowserPush> = {}): BrowserPush => ({
  supported: true,
  ios: false,
  standalone: false,
  permission: 'default',
  endpoint: null,
  ...overrides,
});

describe('notification state', () => {
  test('on only when allowed and subscribed', () => {
    expect(pushStatus(browser({ permission: 'granted', endpoint: 'https://x' }), true)).toBe('on');
    expect(pushStatus(browser({ permission: 'granted' }), true)).toBe('off');
    expect(pushStatus(browser({ endpoint: 'https://x' }), true)).toBe('off');
    expect(pushStatus(browser({ permission: 'denied' }), true)).toBe('denied');
  });

  test('iPhone in a Safari tab must be added to the home screen first', () => {
    expect(pushStatus(browser({ supported: false, ios: true }), true)).toBe('ios_install');
    expect(pushStatus(browser({ ios: true, standalone: true }), true)).toBe('off');
    // Installed but too old a system: no Web Push at all.
    expect(pushStatus(browser({ supported: false, ios: true, standalone: true }), true)).toBe(
      'unsupported',
    );
    expect(pushStatus(browser({ supported: false }), true)).toBe('unsupported');
  });

  test('a server without VAPID keys', () => {
    expect(pushStatus(browser({ permission: 'granted', endpoint: 'https://x' }), false)).toBe(
      'not_configured',
    );
  });
});

describe('devices', () => {
  const IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const IPAD =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const EDGE =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0';
  const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

  test('iOS, iPadOS (which says Macintosh) but not a Mac', () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD, 5)).toBe(true);
    expect(isIos(IPAD, 0)).toBe(false);
    expect(isIos(ANDROID, 5)).toBe(false);
  });

  test('a short name per device', () => {
    expect(deviceName(IPHONE)).toBe('Safari · iPhone');
    expect(deviceName(ANDROID)).toBe('Chrome · Android');
    expect(deviceName(EDGE)).toBe('Edge · Windows');
    expect(deviceName(FIREFOX)).toBe('Firefox · Linux');
    expect(deviceName('')).toBe('');
  });
});

test('the VAPID key as bytes', () => {
  const key =
    'BDAjrN6hd_Hc2OHdE4nTIkhbrxCeqaWwfmbDbbbaT8CNS2jjPYZqqSZMkYles-Qon2UFknP0Gj47chgAx4ThjDI';
  const bytes = keyBytes(key);
  expect(bytes.length).toBe(65);
  expect(bytes[0]).toBe(4);
  expect(Buffer.from(bytes).toString('base64url')).toBe(key);
});

describe('more notification states', () => {
  test('unsupported and not configured take precedence over the permission', () => {
    expect(pushStatus(browser({ supported: false, permission: 'denied' }), true)).toBe(
      'unsupported',
    );
    expect(pushStatus(browser({ permission: 'denied' }), false)).toBe('not_configured');
  });

  test('a denied permission wins over an existing subscription', () => {
    expect(pushStatus(browser({ permission: 'denied', endpoint: 'https://x' }), true)).toBe(
      'denied',
    );
  });

  test('an iOS device with push support is handled as any browser', () => {
    expect(pushStatus(browser({ ios: true }), true)).toBe('off');
    expect(
      pushStatus(
        browser({ ios: true, standalone: true, permission: 'granted', endpoint: 'e' }),
        true,
      ),
    ).toBe('on');
  });

  test('an empty endpoint is not a subscription', () => {
    expect(pushStatus(browser({ permission: 'granted', endpoint: '' }), true)).toBe('off');
  });
});

describe('more devices', () => {
  const CHROME_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const FIREFOX_IOS =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15';
  const OPERA =
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 OPR/114.0';
  const SAMSUNG =
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36';
  const CHROME_OS =
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
  const SAFARI_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

  test('the most specific browser wins over the engines it imitates', () => {
    expect(deviceName(CHROME_MAC)).toBe('Chrome · macOS');
    expect(deviceName(FIREFOX_IOS)).toBe('Firefox · iPhone');
    expect(deviceName(OPERA)).toBe('Opera · Windows');
    expect(deviceName(SAMSUNG)).toBe('Samsung Internet · Android');
    expect(deviceName(CHROME_OS)).toBe('Chrome · ChromeOS');
    expect(deviceName(SAFARI_MAC)).toBe('Safari · macOS');
  });

  test('only one part is shown when the other is unknown', () => {
    expect(deviceName('Firefox/130.0')).toBe('Firefox');
    expect(deviceName('(Windows NT 10.0)')).toBe('Windows');
    expect(deviceName('curl/8.0')).toBe('');
  });

  test('isIos recognises iPod and ignores a Mac with at most one touch point', () => {
    expect(isIos('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)', 0)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 1)).toBe(false);
    expect(isIos('', 10)).toBe(false);
  });
});

describe('keyBytes edge cases', () => {
  test('padding is optional and the url alphabet is mapped', () => {
    expect(Array.from(keyBytes(''))).toEqual([]);
    expect(Array.from(keyBytes('-_8'))).toEqual([251, 255]);
    expect(Array.from(keyBytes('-_8='))).toEqual([251, 255]);
    expect(Array.from(keyBytes('YQ'))).toEqual([97]);
    expect(Array.from(keyBytes('YWI'))).toEqual([97, 98]);
  });
});
