import { describe, expect, test } from 'bun:test';
import { ipSubject } from './ip-subject';

describe('ipSubject', () => {
  test('IPv4 addresses count one by one', () => {
    expect(ipSubject('203.0.113.7')).toBe('203.0.113.7');
    expect(ipSubject(' 203.0.113.7 ')).toBe('203.0.113.7');
  });

  test('IPv6 addresses count per /64, however they are written', () => {
    const subject = '2001:db8:1:2::/64';
    expect(ipSubject('2001:db8:1:2::1')).toBe(subject);
    expect(ipSubject('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe(subject);
    expect(ipSubject('2001:DB8:1:2:a:b:c:d')).toBe(subject);
    expect(ipSubject('[2001:db8:1:2::42]')).toBe(subject);
    expect(ipSubject('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    // Another /64: another subject.
    expect(ipSubject('2001:db8:1:3::1')).toBe('2001:db8:1:3::/64');
    expect(ipSubject('::1')).toBe('0:0:0:0::/64');
  });

  test('IPv4-mapped IPv6 is the IPv4 address', () => {
    expect(ipSubject('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipSubject('::ffff:cb00:7107')).toBe('203.0.113.7');
  });

  test('a port after the address is left out', () => {
    expect(ipSubject('203.0.113.7:5678')).toBe('203.0.113.7');
    expect(ipSubject('[2001:db8:1:2::1]:443')).toBe('2001:db8:1:2::/64');
  });

  test('anything else is kept as it is', () => {
    expect(ipSubject('unknown')).toBe('unknown');
    expect(ipSubject('1:2:3')).toBe('1:2:3');
    expect(ipSubject('1::2::3')).toBe('1::2::3');
    expect(ipSubject('1:2:3:4:5:6:7:8:9')).toBe('1:2:3:4:5:6:7:8:9');
    expect(ipSubject('::ffff:999.0.0.1')).toBe('::ffff:999.0.0.1');
  });
});
