import { describe, expect, test } from 'bun:test';
import { totpSecret } from './security';

describe('totpSecret', () => {
  test('reads the secret of an otpauth URI, grouped by 4 for typing', () => {
    const uri = 'otpauth://totp/CookIt:alice%40example.com?secret=JBSWY3DPEHPK3PXPAB&issuer=CookIt';
    expect(totpSecret(uri)).toBe('JBSW Y3DP EHPK 3PXP AB');
  });

  test('is empty for a URI without secret or an invalid one', () => {
    expect(totpSecret('otpauth://totp/CookIt?issuer=CookIt')).toBe('');
    expect(totpSecret('not a uri')).toBe('');
  });
});
