/**
 * Single source of truth for all countdown timer visual styling.
 *
 * Replace the placeholder values below with real Dick's Sporting Goods
 * email brand guideline values. Nothing in the drawing code (lib/gif.ts)
 * should ever hardcode a color, font, or size — it all flows from here.
 *
 * To add a brand font, see fonts/README.md and the "Swapping in brand
 * fonts/tokens" section of the root README.
 */

export interface ThemeTokens {
  colors: {
    background: string;
    digits: string;
    labels: string;
    separators: string;
    expiredText: string;
    expiredBackground: string;
  };
  /**
   * Optional full-bleed creative behind the countdown. The PNG must match
   * the physical render size (layout.width×2 by layout.height×2 — see
   * creative/SPECS.md). If the file is missing or unreadable, the renderer
   * falls back to the flat background colors — never crashes.
   */
  background?: {
    /** Repo-relative path, e.g. 'creative/goodgood-bg.png'. */
    imagePath: string;
  };
  typography: {
    fontFamily: string;
    digitWeight: 'normal' | 'bold';
    digitSizePx: number;
    labelSizePx: number;
    labelTracking: number;
    labelCase: 'uppercase' | 'none';
  };
  layout: {
    width: number;
    height: number;
    segmentGapPx: number;
    showDays: boolean;
    separator: string;
    /**
     * Optional rectangle (logical px) the countdown row centers itself
     * inside, so creative can reserve part of the canvas for artwork
     * (e.g. a logo on the left, timer on the right). Omit to use the
     * full canvas. The expired message centers in the same box.
     */
    timerBox?: { x: number; y: number; width: number; height: number };
  };
  expired: {
    message: string;
  };
}

export const themes = {
  default: {
    colors: {
      background: '#0B0B0B', // placeholder
      digits: '#FFFFFF', // placeholder
      labels: '#9CA3AF', // placeholder
      separators: '#4B5563', // placeholder
      expiredText: '#FFFFFF', // placeholder
      expiredBackground: '#0B0B0B', // placeholder
    },
    typography: {
      fontFamily: 'BrandFont', // registered via GlobalFonts, see lib/gif.ts
      digitWeight: 'bold',
      digitSizePx: 42,
      labelSizePx: 11,
      labelTracking: 1.5,
      labelCase: 'uppercase',
    },
    layout: {
      width: 320,
      height: 90,
      segmentGapPx: 18,
      showDays: true,
      separator: ':',
    },
    expired: {
      message: 'OFFER ENDED',
    },
  },

  /**
   * Demo of the creative-wrap workflow: a full-bleed background PNG from
   * the creative team with the countdown rendered inside a reserved
   * timer zone. The bundled goodgood-bg.png is PLACEHOLDER art — see
   * creative/SPECS.md for the exact deliverable spec to hand to design.
   */
  goodgood: {
    colors: {
      background: '#0A3D2C', // fallback fill if the PNG is missing
      digits: '#FFFFFF',
      labels: '#CBB980',
      separators: '#5E7A6D',
      expiredText: '#FFFFFF',
      expiredBackground: '#0A3D2C',
    },
    background: {
      imagePath: 'creative/goodgood-bg.png',
    },
    typography: {
      fontFamily: 'BrandFont',
      digitWeight: 'bold',
      digitSizePx: 42,
      labelSizePx: 11,
      labelTracking: 1.5,
      labelCase: 'uppercase',
    },
    layout: {
      width: 320,
      height: 90,
      segmentGapPx: 18,
      showDays: true,
      separator: ':',
      // Left 105 logical px reserved for the event lockup in the PNG.
      timerBox: { x: 105, y: 0, width: 215, height: 90 },
    },
    expired: {
      message: "IT'S TEE TIME",
    },
  },
} as const satisfies Record<string, ThemeTokens>;

export type ThemeName = keyof typeof themes;

export const DEFAULT_THEME: ThemeName = 'default';

export function resolveTheme(name: string | null | undefined): ThemeTokens {
  if (name && Object.prototype.hasOwnProperty.call(themes, name)) {
    return themes[name as ThemeName];
  }
  return themes[DEFAULT_THEME];
}
