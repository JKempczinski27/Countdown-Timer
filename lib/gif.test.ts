import { describe, it, expect } from 'vitest';
import { renderCountdownGif, renderFallbackGif } from './gif';
import { resolveTheme } from '@/brand.config';

/** GIF89a magic number. */
function isGif(buf: Buffer): boolean {
  return buf.length > 6 && buf.toString('ascii', 0, 6) === 'GIF89a';
}

/**
 * Counts frames by walking the GIF block structure and counting Image
 * Descriptors (0x2C). Respects color-table and sub-block sizes so it
 * never miscounts data bytes as block markers (a naive byte-scan for
 * markers overcounts, since those bytes occur inside LZW image data).
 */
function countFrames(buf: Buffer): number {
  let p = 6; // skip 'GIF89a'
  const packed = buf[p + 4] as number;
  p += 7; // logical screen descriptor
  if (packed & 0x80) {
    const gctSize = 2 ** ((packed & 0x07) + 1);
    p += 3 * gctSize; // global color table
  }

  const skipSubBlocks = () => {
    while (p < buf.length) {
      const size = buf[p++] as number;
      if (size === 0) break;
      p += size;
    }
  };

  let frames = 0;
  while (p < buf.length) {
    const block = buf[p++] as number;
    if (block === 0x3b) break; // trailer
    if (block === 0x21) {
      p++; // extension label
      skipSubBlocks();
    } else if (block === 0x2c) {
      frames++;
      const imgPacked = buf[p + 8] as number;
      p += 9; // image descriptor
      if (imgPacked & 0x80) {
        p += 3 * 2 ** ((imgPacked & 0x07) + 1); // local color table
      }
      p++; // LZW minimum code size
      skipSubBlocks();
    } else {
      break; // unexpected byte; stop rather than misread
    }
  }
  return frames;
}

const theme = resolveTheme('default');
const goodgood = resolveTheme('goodgood');

describe('renderCountdownGif', () => {
  it('returns a valid GIF', async () => {
    const buf = await renderCountdownGif(Date.now() + 3 * 86400_000, theme);
    expect(isGif(buf)).toBe(true);
  });

  it('renders 60 frames for an active countdown', async () => {
    const buf = await renderCountdownGif(Date.now() + 3 * 86400_000, theme);
    expect(countFrames(buf)).toBe(60);
  });

  it('renders a single frozen frame when already expired', async () => {
    const buf = await renderCountdownGif(Date.parse('2020-01-01T00:00:00Z'), theme);
    expect(isGif(buf)).toBe(true);
    expect(countFrames(buf)).toBe(1);
  });

  it('adds intro frames when the theme declares an intro', async () => {
    const plain = await renderCountdownGif(Date.now() + 3 * 86400_000, theme);
    const withIntro = await renderCountdownGif(Date.now() + 3 * 86400_000, goodgood);
    // goodgood adds 1 hold + N crossfade frames on top of the 60 countdown.
    expect(countFrames(withIntro)).toBeGreaterThan(countFrames(plain));
  });

  it('never negative: expired far in the past still yields one frame', async () => {
    const buf = await renderCountdownGif(0, theme);
    expect(countFrames(buf)).toBe(1);
  });
});

describe('renderFallbackGif', () => {
  it('returns a valid single-frame GIF', async () => {
    const buf = await renderFallbackGif(theme);
    expect(isGif(buf)).toBe(true);
    expect(countFrames(buf)).toBe(1);
  });
});
