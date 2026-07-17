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
} as const satisfies Record<string, ThemeTokens>;

export type ThemeName = keyof typeof themes;

export const DEFAULT_THEME: ThemeName = 'default';

export function resolveTheme(name: string | null | undefined): ThemeTokens {
  if (name && Object.prototype.hasOwnProperty.call(themes, name)) {
    return themes[name as ThemeName];
  }
  return themes[DEFAULT_THEME];
}
