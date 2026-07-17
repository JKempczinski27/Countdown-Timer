import fs from 'node:fs';
import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';

/**
 * Logical font family name used throughout brand.config.ts and lib/gif.ts.
 * Whatever file gets registered below (brand font or fallback) is aliased
 * to this family, so drawing code never needs to know which one loaded.
 */
export const FONT_FAMILY = 'BrandFont';

const FONTS_DIR = path.join(process.cwd(), 'fonts');
const BRAND_FONT_CANDIDATES = ['brand.ttf', 'brand.otf'];
const FALLBACK_FONT_PATH = path.join(FONTS_DIR, 'Inter-Bold.ttf');

let registered = false;

/**
 * Registers the brand font (or falls back to the bundled Inter Bold) once
 * per server process. Never throws — a missing or corrupt font file must
 * never take the /api/timer endpoint down.
 */
export function ensureFontRegistered(): void {
  if (registered) return;
  registered = true;

  for (const candidate of BRAND_FONT_CANDIDATES) {
    const candidatePath = path.join(FONTS_DIR, candidate);
    try {
      if (fs.existsSync(candidatePath)) {
        GlobalFonts.registerFromPath(candidatePath, FONT_FAMILY);
        return;
      }
    } catch {
      // Try the next candidate / fall through to the bundled fallback.
    }
  }

  try {
    if (fs.existsSync(FALLBACK_FONT_PATH)) {
      GlobalFonts.registerFromPath(FALLBACK_FONT_PATH, FONT_FAMILY);
    }
  } catch {
    // Worst case: @napi-rs/canvas falls back to its own default sans-serif.
  }
}
