import { IMAGE_LIMITS, type ImageKind, type ImageType } from '@cookit/shared';

export type ImageInfo = { type: ImageType; width: number; height: number };

const ascii = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));
const u16le = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8);
const u24le = (bytes: Uint8Array, at: number) => u16le(bytes, at) | (bytes[at + 2]! << 16);
const u32le = (bytes: Uint8Array, at: number) => (u24le(bytes, at) | (bytes[at + 3]! << 24)) >>> 0;
const u16be = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!;

/**
 * WebP (RIFF container): the first chunk gives the size. `VP8 ` is lossy, `VP8L` lossless,
 * `VP8X` the extended format (refused when animated: a browser never writes one from a canvas).
 */
function webp(bytes: Uint8Array): ImageInfo | undefined {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return undefined;
  }
  // The RIFF size covers the whole file after its first 8 bytes.
  if (u32le(bytes, 4) + 8 !== bytes.length) return undefined;
  const chunk = ascii(bytes, 12, 4);
  if (chunk === 'VP8 ') {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;
    return {
      type: 'image/webp',
      width: u16le(bytes, 26) & 0x3fff,
      height: u16le(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return undefined;
    const bits = u32le(bytes, 21);
    return { type: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    const animated = (bytes[20]! & 0x02) !== 0;
    if (animated) return undefined;
    return { type: 'image/webp', width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
  }
  return undefined;
}

/** Start-of-frame markers (baseline, progressive…), which hold the dimensions. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** JPEG: walks the segments up to the first start-of-frame. */
function jpeg(bytes: Uint8Array): ImageInfo | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1]!;
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Start of scan or end of image before any frame: not a picture we can read.
    if (marker === 0xda || marker === 0xd9) return undefined;
    const length = u16be(bytes, at + 2);
    if (length < 2) return undefined;
    if (SOF.has(marker)) {
      if (at + 9 > bytes.length) return undefined;
      return { type: 'image/jpeg', height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    at += 2 + length;
  }
  return undefined;
}

/**
 * Type and dimensions of an uploaded picture, read from its header only (no decoding library):
 * WebP or JPEG, anything else is refused. Undefined when it is not a picture we accept.
 */
export function readImageHeader(bytes: Uint8Array): ImageInfo | undefined {
  const info = webp(bytes) ?? jpeg(bytes);
  return info && info.width > 0 && info.height > 0 ? info : undefined;
}

/**
 * The picture's type when it is acceptable as `kind`: a WebP or JPEG within the size limits
 * (bytes and longest side). A picture too big in pixels could take a lot of memory to display.
 */
export function checkImage(bytes: Uint8Array, kind: ImageKind): ImageType | undefined {
  const limits = IMAGE_LIMITS[kind];
  if (bytes.length === 0 || bytes.length > limits.maxBytes) return undefined;
  const info = readImageHeader(bytes);
  if (!info || Math.max(info.width, info.height) > limits.maxSide) return undefined;
  return info.type;
}
