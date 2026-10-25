/**
 * The rate-limiting subject of a client address. An IPv6 client usually holds a whole /64 (2^64
 * addresses it can switch between at will): counting per address would let it skip every per-IP
 * limit, so IPv6 addresses count per /64. IPv4 (and IPv4-mapped IPv6) count per address.
 * Pure (no `node:net`): the demo build loads the rate-limit middleware in a browser.
 */
export function ipSubject(address: string): string {
  const withoutPort = address
    .trim()
    .replace(/^\[([^\]]+)\]:\d+$/, '$1')
    .replace(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/, '$1');
  return subjectOf(withoutPort);
}

function subjectOf(address: string): string {
  const ip =
    address
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, '')
      .split('%')[0] ?? '';
  if (!ip.includes(':')) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  // ::ffff:a.b.c.d (an IPv4 client on a dual-stack socket): the IPv4 address.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::/64`;
}

/** The 8 groups of an IPv6 address, or undefined when it is not one. */
function ipv6Groups(ip: string): number[] | undefined {
  const halves = ip.split('::');
  if (halves.length > 2) return undefined;
  const parse = (part: string): number[] | undefined => {
    if (part === '') return [];
    const groups: number[] = [];
    const pieces = part.split(':');
    for (const [i, piece] of pieces.entries()) {
      // An IPv4 tail (::ffff:1.2.3.4) is two groups.
      if (i === pieces.length - 1 && piece.includes('.')) {
        const bytes = piece.split('.').map(Number);
        const valid =
          bytes.length === 4 && bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255);
        if (!valid) return undefined;
        const [a = 0, b = 0, c = 0, d = 0] = bytes;
        groups.push((a << 8) | b, (c << 8) | d);
      } else if (/^[0-9a-f]{1,4}$/.test(piece)) {
        groups.push(parseInt(piece, 16));
      } else {
        return undefined;
      }
    }
    return groups;
  };
  const head = parse(halves[0] ?? '');
  const tail = halves.length === 2 ? parse(halves[1] ?? '') : [];
  if (!head || !tail) return undefined;
  if (halves.length === 1) return head.length === 8 ? head : undefined;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return undefined;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}
