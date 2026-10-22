import { describe, expect, test } from 'bun:test';
import { checkImage, readImageHeader } from './images';

// Written by Chromium from a 10 × 7 canvas (`toBlob`), as the app does.
const CHROME_WEBP =
  'UklGRjYCAABXRUJQVlA4WAoAAAAgAAAACQAABgAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggSAAAABACAJ0BKgoABwABQCYlsAJ0ugADHxa7IAAA99KcD+KcRx42aam3D/4wuxdinPUPf/k2/7/DR/z/49/fqs7/sHH/YOP3TAAAAA==';
const CHROME_JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAHAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAdEAACAgEFAAAAAAAAAAAAAAABAgADBQQREmHR/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAdEQACAgEFAAAAAAAAAAAAAAACBAABAxESE1Hx/9oADAMBAAIRAxEAPwCNkMm+tpWt61UBuW4PR9k+Ih8QoK0GUxJFdDFwrDtHr2f/2Q==';
const CHROME_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAHCAYAAAAxrNxjAAAAOElEQVR4AYyOsQ0AIBAC31+JNXRaHeN3wp5QQHINuQQaAyoDUOkKk4v7shQ30uetUqzoStfFHz8AAAD///Um5EAAAAAGSURBVAMAC2ok+RGqCYcAAAAASUVORK5CYII=';

const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));

/** A RIFF/WEBP file around one chunk (its data padded to `size` bytes). */
function riff(chunk: string, data: number[], size = 30): Uint8Array {
  const body = [...data, ...Array<number>(Math.max(0, size - data.length)).fill(0)];
  const file = new Uint8Array(20 + body.length);
  const view = new DataView(file.buffer);
  file.set(Buffer.from('RIFF'), 0);
  view.setUint32(4, file.length - 8, true);
  file.set(Buffer.from('WEBP'), 8);
  file.set(Buffer.from(chunk), 12);
  view.setUint32(16, body.length, true);
  file.set(body, 20);
  return file;
}

/** Lossy WebP header: frame tag, start code, 14-bit width and height. */
const vp8 = (width: number, height: number) =>
  riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, width >> 8, height & 0xff, height >> 8]);

/** Lossless WebP header: signature, then width - 1 and height - 1 on 14 bits each. */
function vp8l(width: number, height: number) {
  const bits = (width - 1) | ((height - 1) << 14);
  return riff('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, bits >>> 24]);
}

/** Extended WebP header: flags, then canvas width - 1 and height - 1 on 24 bits each. */
function vp8x(width: number, height: number, flags = 0) {
  const w = width - 1;
  const h = height - 1;
  return riff('VP8X', [
    flags,
    0,
    0,
    0,
    w & 0xff,
    (w >> 8) & 0xff,
    w >> 16,
    h & 0xff,
    (h >> 8) & 0xff,
    h >> 16,
  ]);
}

/** A JPEG with an APP0 segment, then a baseline start-of-frame. */
function jpeg(width: number, height: number, marker = 0xc0) {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    marker,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x00,
    0x00,
    0x00,
  ]);
}

describe('readImageHeader', () => {
  test('pictures written by the browser', () => {
    expect(readImageHeader(bytes(CHROME_WEBP))).toEqual({
      type: 'image/webp',
      width: 10,
      height: 7,
    });
    expect(readImageHeader(bytes(CHROME_JPEG))).toEqual({
      type: 'image/jpeg',
      width: 10,
      height: 7,
    });
  });

  test('every WebP flavour', () => {
    expect(readImageHeader(vp8(1600, 1200))).toEqual({
      type: 'image/webp',
      width: 1600,
      height: 1200,
    });
    expect(readImageHeader(vp8l(480, 320))).toEqual({
      type: 'image/webp',
      width: 480,
      height: 320,
    });
    expect(readImageHeader(vp8x(16_383, 9000))).toEqual({
      type: 'image/webp',
      width: 16_383,
      height: 9000,
    });
  });

  test('progressive JPEG and fill bytes', () => {
    expect(readImageHeader(jpeg(640, 480, 0xc2))).toEqual({
      type: 'image/jpeg',
      width: 640,
      height: 480,
    });
    const filled = jpeg(20, 10);
    const withFill = new Uint8Array([...filled.subarray(0, 8), 0xff, ...filled.subarray(8)]);
    expect(readImageHeader(withFill)?.width).toBe(20);
  });

  test('JPEG with several segments before the start-of-frame', () => {
    const segment = (marker: number, length: number) => [
      0xff,
      marker,
      (length + 2) >> 8,
      (length + 2) & 0xff,
      ...Array<number>(length).fill(0x41),
    ];
    const file = new Uint8Array([
      0xff,
      0xd8,
      ...segment(0xe0, 14),
      ...segment(0xe1, 300),
      ...segment(0xdb, 65),
      ...segment(0xc4, 20),
      0xff,
      0xc2,
      0x00,
      0x11,
      0x08,
      0x02,
      0x58,
      0x03,
      0x20,
      0x03,
      0,
      0,
      0,
    ]);
    expect(readImageHeader(file)).toEqual({ type: 'image/jpeg', width: 800, height: 600 });
  });

  test('JPEG: a DHT marker (0xc4) is not mistaken for a frame, zero dimensions are refused', () => {
    expect(readImageHeader(jpeg(0, 10))).toBeUndefined();
    expect(readImageHeader(jpeg(10, 0))).toBeUndefined();
    expect(readImageHeader(jpeg(10, 10, 0xc4))).toBeUndefined();
  });

  test('JPEG: the largest dimensions (65535) are read', () => {
    expect(readImageHeader(jpeg(65_535, 65_535))).toEqual({
      type: 'image/jpeg',
      width: 65_535,
      height: 65_535,
    });
  });

  test('WebP: 14-bit limits of lossy and lossless', () => {
    expect(readImageHeader(vp8(16_383, 16_383))?.width).toBe(16_383);
    expect(readImageHeader(vp8l(16_384, 1))).toEqual({
      type: 'image/webp',
      width: 16_384,
      height: 1,
    });
  });

  test('a RIFF file that is not WebP is refused', () => {
    const wave = vp8(10, 10);
    wave.set(Buffer.from('WAVE'), 8);
    expect(readImageHeader(wave)).toBeUndefined();
  });

  test('anything else is refused', () => {
    expect(readImageHeader(bytes(CHROME_PNG))).toBeUndefined();
    expect(
      readImageHeader(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeUndefined();
    expect(readImageHeader(new TextEncoder().encode('GIF89a\x01\x00\x01\x00'))).toBeUndefined();
    expect(readImageHeader(new Uint8Array())).toBeUndefined();
  });

  test('broken or odd WebP files are refused', () => {
    // Animated (flag 0x02).
    expect(readImageHeader(vp8x(100, 100, 0x02))).toBeUndefined();
    // RIFF size that does not match the file (truncated or with trailing data).
    expect(readImageHeader(vp8(10, 10).subarray(0, 40))).toBeUndefined();
    expect(readImageHeader(new Uint8Array([...vp8(10, 10), 0, 0]))).toBeUndefined();
    // Wrong start code or signature.
    const badStart = vp8(10, 10);
    badStart[23] = 0;
    expect(readImageHeader(badStart)).toBeUndefined();
    const badSignature = vp8l(10, 10);
    badSignature[20] = 0;
    expect(readImageHeader(badSignature)).toBeUndefined();
    // Unknown first chunk, zero size.
    expect(readImageHeader(riff('ALPH', []))).toBeUndefined();
    expect(readImageHeader(vp8(0, 10))).toBeUndefined();
  });

  test('broken JPEG files are refused', () => {
    // Start of scan or end of image before any frame.
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeUndefined();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x02]))).toBeUndefined();
    // Truncated frame, segment without marker, impossible length.
    expect(readImageHeader(jpeg(10, 10).subarray(0, 14))).toBeUndefined();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0x00, 0xe0, 0x00, 0x04]))).toBeUndefined();
    expect(
      readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0, 0])),
    ).toBeUndefined();
    // Segments that run past the end.
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff]))).toBeUndefined();
  });
});

describe('checkImage', () => {
  test('within the limits of each kind', () => {
    expect(checkImage(vp8(1600, 900), 'full')).toBe('image/webp');
    expect(checkImage(jpeg(480, 300), 'thumb')).toBe('image/jpeg');
    expect(checkImage(vp8l(256, 256), 'avatar')).toBe('image/webp');
  });

  test('too many pixels for the kind', () => {
    expect(checkImage(vp8(1601, 900), 'full')).toBeUndefined();
    expect(checkImage(vp8(900, 1601), 'full')).toBeUndefined();
    expect(checkImage(jpeg(481, 10), 'thumb')).toBeUndefined();
    expect(checkImage(vp8l(257, 10), 'avatar')).toBeUndefined();
    // Small file, huge canvas: would take gigabytes to display.
    expect(checkImage(vp8x(16_000, 16_000), 'full')).toBeUndefined();
  });

  test('too many bytes for the kind', () => {
    const big = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 10, 0, 10, 0], 100_001);
    expect(readImageHeader(big)).toBeDefined();
    expect(checkImage(big, 'avatar')).toBeUndefined();
    expect(checkImage(big, 'thumb')).toBe('image/webp');
  });
});
