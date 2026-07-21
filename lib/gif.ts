import path from 'node:path';
import {
  createCanvas,
  loadImage,
  type Image,
  type Canvas,
  type SKRSContext2D,
} from '@napi-rs/canvas';
import { GIFEncoder, quantize, applyPalette, type PaletteColor } from 'gifenc';
import type { ThemeTokens } from '@/brand.config';
import { ensureFontRegistered, FONT_FAMILY } from './fonts';

/** Draw at 2x logical size so digits stay crisp in email clients. */
const SCALE = 2;
const FRAME_COUNT = 60;
const FRAME_DELAY_MS = 1000;
const MAX_DISPLAY_DAYS = 99;

/**
 * Target per-step delay for the intro crossfade. Kept at/above ~80ms
 * because several email clients clamp very short GIF frame delays.
 */
const INTRO_STEP_TARGET_MS = 80;
const INTRO_MIN_STEPS = 4;
const INTRO_MAX_STEPS = 15;

/**
 * Brand-safe static image shown if a render ever fails unexpectedly.
 * The Golf Galaxy header keeps a broken render on-brand instead of
 * surfacing a broken-image icon or bare text. Falls back to a flat
 * message if even this asset can't load.
 */
const FALLBACK_IMAGE_PATH = 'creative/golfgalaxy-header.png';

interface Segment {
  value: string;
  label: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Decoded background images, cached per path for the process lifetime. */
const backgroundCache = new Map<string, Image>();

/**
 * Image decoding in @napi-rs/canvas is asynchronous — drawImage before
 * the decode completes silently draws nothing — so backgrounds must be
 * awaited via loadImage before any frame is drawn.
 */
async function loadBackgroundImage(imagePath: string): Promise<Image | null> {
  const cached = backgroundCache.get(imagePath);
  if (cached) return cached;

  try {
    const decoded = await loadImage(path.join(process.cwd(), imagePath));
    if (decoded.width > 0 && decoded.height > 0) {
      // Only successful decodes are cached — a transient read/decode
      // failure degrades one response to the flat-color fallback and is
      // retried on the next request, rather than poisoning the process.
      backgroundCache.set(imagePath, decoded);
      return decoded;
    }
  } catch {
    // Missing/corrupt creative must never take the endpoint down; the
    // flat theme background color is the fallback.
  }
  return null;
}

/** Physical-pixel rectangle the countdown row (or expired text) fits in. */
function timerBoxFor(theme: ThemeTokens): Box {
  const box = theme.layout.timerBox ?? {
    x: 0,
    y: 0,
    width: theme.layout.width,
    height: theme.layout.height,
  };
  return {
    x: box.x * SCALE,
    y: box.y * SCALE,
    width: box.width * SCALE,
    height: box.height * SCALE,
  };
}

function drawBackground(
  ctx: SKRSContext2D,
  theme: ThemeTokens,
  image: Image | null,
  fallbackColor: string,
): void {
  const w = theme.layout.width * SCALE;
  const h = theme.layout.height * SCALE;
  if (image) {
    ctx.drawImage(image, 0, 0, w, h);
  } else {
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(0, 0, w, h);
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function segmentsFor(remainingSeconds: number, theme: ThemeTokens): Segment[] {
  const total = Math.max(0, remainingSeconds);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;

  if (theme.layout.showDays) {
    const hours = Math.floor(total / 3600) % 24;
    const days = Math.min(Math.floor(total / 86400), MAX_DISPLAY_DAYS);
    return [
      { value: pad2(days), label: 'DAYS' },
      { value: pad2(hours), label: 'HRS' },
      { value: pad2(minutes), label: 'MIN' },
      { value: pad2(seconds), label: 'SEC' },
    ];
  }

  const hours = Math.min(Math.floor(total / 3600), MAX_DISPLAY_DAYS);
  return [
    { value: pad2(hours), label: 'HRS' },
    { value: pad2(minutes), label: 'MIN' },
    { value: pad2(seconds), label: 'SEC' },
  ];
}

function applyLabelCase(label: string, theme: ThemeTokens): string {
  return theme.typography.labelCase === 'uppercase' ? label.toUpperCase() : label.toLowerCase();
}

function drawTracked(
  ctx: SKRSContext2D,
  text: string,
  centerX: number,
  y: number,
  trackingPx: number,
): void {
  if (trackingPx <= 0) {
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, y);
    return;
  }
  ctx.textAlign = 'left';
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth =
    widths.reduce((a, b) => a + b, 0) + trackingPx * Math.max(0, text.length - 1);
  let x = centerX - totalWidth / 2;
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i] as string, x, y);
    x += (widths[i] as number) + trackingPx;
  }
}

function drawCountdownFrame(
  ctx: SKRSContext2D,
  theme: ThemeTokens,
  background: Image | null,
  remainingSeconds: number,
): void {
  const { colors, typography, layout } = theme;

  drawBackground(ctx, theme, background, colors.background);

  const box = timerBoxFor(theme);
  const segments = segmentsFor(remainingSeconds, theme);
  ctx.textBaseline = 'alphabetic';

  // Measure at configured token sizes, then scale everything down
  // uniformly if the row would overflow the timer box — token values are
  // brand preferences, but the render must always fit.
  const measure = (digitPx: number, gapPx: number) => {
    ctx.font = `${typography.digitWeight} ${digitPx}px ${FONT_FAMILY}`;
    const digitWidth = Math.max(...segments.map((s) => ctx.measureText(s.value).width));
    const sepWidth = layout.separator ? ctx.measureText(layout.separator).width : 0;
    const totalWidth =
      segments.length * digitWidth + (segments.length - 1) * (sepWidth + gapPx * 2);
    return { digitWidth, sepWidth, totalWidth };
  };

  const baseDigitSize = typography.digitSizePx * SCALE;
  const baseGap = layout.segmentGapPx * SCALE;
  const maxRowWidth = box.width * 0.94;
  const baseMeasure = measure(baseDigitSize, baseGap);
  const fit = Math.min(1, maxRowWidth / baseMeasure.totalWidth);

  const digitSize = baseDigitSize * fit;
  const labelSize = typography.labelSizePx * SCALE * fit;
  const gap = baseGap * fit;
  const digitFont = `${typography.digitWeight} ${digitSize}px ${FONT_FAMILY}`;
  const labelFont = `${typography.digitWeight} ${labelSize}px ${FONT_FAMILY}`;

  const { digitWidth, sepWidth, totalWidth } =
    fit === 1 ? baseMeasure : measure(digitSize, gap);
  const startX = box.x + (box.width - totalWidth) / 2;

  const digitBaselineY = box.y + box.height * 0.52;
  const labelBaselineY = digitBaselineY + labelSize * 1.6;

  let x = startX;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as Segment;
    const centerX = x + digitWidth / 2;

    ctx.font = digitFont;
    ctx.fillStyle = colors.digits;
    ctx.textAlign = 'center';
    ctx.fillText(seg.value, centerX, digitBaselineY);

    ctx.font = labelFont;
    ctx.fillStyle = colors.labels;
    drawTracked(
      ctx,
      applyLabelCase(seg.label, theme),
      centerX,
      labelBaselineY,
      typography.labelTracking * SCALE * fit,
    );

    x += digitWidth;
    if (i < segments.length - 1 && layout.separator) {
      ctx.font = digitFont;
      ctx.fillStyle = colors.separators;
      ctx.textAlign = 'center';
      ctx.fillText(layout.separator, x + gap + sepWidth / 2, digitBaselineY);
      x += sepWidth + gap * 2;
    }
  }
}

function drawExpiredFrame(
  ctx: SKRSContext2D,
  theme: ThemeTokens,
  background: Image | null,
): void {
  const { colors, typography, expired } = theme;

  drawBackground(ctx, theme, background, colors.expiredBackground);

  const box = timerBoxFor(theme);
  const baseSize = typography.digitSizePx * SCALE * 0.75;

  // Shrink the message to fit the timer box, same policy as the digits.
  ctx.font = `${typography.digitWeight} ${baseSize}px ${FONT_FAMILY}`;
  const tracking = typography.labelTracking * SCALE;
  const baseWidth =
    ctx.measureText(expired.message).width +
    tracking * Math.max(0, expired.message.length - 1);
  const fit = Math.min(1, (box.width * 0.94) / baseWidth);

  ctx.fillStyle = colors.expiredText;
  ctx.font = `${typography.digitWeight} ${baseSize * fit}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  drawTracked(
    ctx,
    expired.message,
    box.x + box.width / 2,
    box.y + box.height / 2,
    tracking * fit,
  );
  ctx.textBaseline = 'alphabetic';
}

function frameToIndexed(
  canvas: Canvas,
  ctx: SKRSContext2D,
  palette: PaletteColor[] | null,
): { index: Uint8Array; palette: PaletteColor[] } {
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const resolvedPalette = palette ?? quantize(data, 256);
  return { index: applyPalette(data, resolvedPalette), palette: resolvedPalette };
}

/** Draws the state the intro crossfades *into* (countdown, or expired). */
function drawDestinationState(
  ctx: SKRSContext2D,
  theme: ThemeTokens,
  background: Image | null,
  remaining: number,
): void {
  if (remaining <= 0) {
    drawExpiredFrame(ctx, theme, background);
  } else {
    drawCountdownFrame(ctx, theme, background, remaining);
  }
}

/**
 * Prepends the opening animation: a hold on the "from" header image,
 * then a crossfade into the destination (countdown/expired) state.
 * Each frame is quantized independently since the blend colors shift.
 * No-ops if the header image can't be loaded, so a missing asset just
 * yields a plain countdown rather than a broken image.
 */
async function writeIntroFrames(
  gif: ReturnType<typeof GIFEncoder>,
  theme: ThemeTokens,
  background: Image | null,
  initialRemaining: number,
  width: number,
  height: number,
): Promise<void> {
  if (!theme.intro) return;
  const fromImage = await loadBackgroundImage(theme.intro.fromImagePath);
  if (!fromImage) return;

  // Offscreen render of the destination state, composited during the fade.
  const toCanvas = createCanvas(width, height);
  const toCtx = toCanvas.getContext('2d');
  drawDestinationState(toCtx, theme, background, initialRemaining);

  const composite = createCanvas(width, height);
  const cctx = composite.getContext('2d');

  const writeComposite = (delay: number) => {
    const { data } = cctx.getImageData(0, 0, width, height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), width, height, {
      palette,
      delay,
      repeat: -1,
    });
  };

  // Hold on the opening header.
  cctx.drawImage(fromImage, 0, 0, width, height);
  writeComposite(theme.intro.holdMs);

  // Crossfade: from header -> destination state.
  const steps = Math.min(
    INTRO_MAX_STEPS,
    Math.max(INTRO_MIN_STEPS, Math.round(theme.intro.transitionMs / INTRO_STEP_TARGET_MS)),
  );
  const stepDelay = Math.round(theme.intro.transitionMs / steps);
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    cctx.globalAlpha = 1;
    cctx.drawImage(fromImage, 0, 0, width, height);
    cctx.globalAlpha = t;
    cctx.drawImage(toCanvas, 0, 0, width, height);
    cctx.globalAlpha = 1;
    writeComposite(stepDelay);
  }
}

/**
 * Renders a countdown GIF. Optionally opens with an intro animation
 * (see theme.intro), then runs 60 frames at 1 fps ticking down one
 * second each; any frame at or past the deadline renders the expired
 * state. The GIF plays once (no loop) and freezes on its final frame,
 * so a countdown never restarts from a stale value, the intro never
 * replays, and an expired message stays on screen.
 */
export async function renderCountdownGif(endMs: number, theme: ThemeTokens): Promise<Buffer> {
  ensureFontRegistered();

  const width = theme.layout.width * SCALE;
  const height = theme.layout.height * SCALE;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const background = theme.background
    ? await loadBackgroundImage(theme.background.imagePath)
    : null;

  const initialRemaining = Math.floor((endMs - Date.now()) / 1000);

  const gif = GIFEncoder();
  let countdownPalette: PaletteColor[] | null = null;

  await writeIntroFrames(gif, theme, background, initialRemaining, width, height);

  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const remaining = initialRemaining - frame;

    if (remaining <= 0) {
      drawExpiredFrame(ctx, theme, background);
      const { index, palette } = frameToIndexed(canvas, ctx, null);
      gif.writeFrame(index, width, height, {
        palette,
        delay: FRAME_DELAY_MS,
        repeat: -1,
      });
      // No loop + freeze-on-last-frame means one expired frame covers all
      // remaining seconds; writing 59 identical frames would waste CPU.
      break;
    }

    drawCountdownFrame(ctx, theme, background, remaining);
    const { index, palette } = frameToIndexed(canvas, ctx, countdownPalette);
    countdownPalette = palette;
    gif.writeFrame(index, width, height, {
      palette,
      delay: FRAME_DELAY_MS,
      repeat: -1,
    });
  }

  gif.finish();
  return Buffer.from(gif.bytesView());
}

/**
 * Minimal single-frame GIF used when rendering fails unexpectedly.
 * Shows the Golf Galaxy header so a failed render stays on-brand rather
 * than surfacing a broken-image icon. Falls back to a flat message if
 * even the header asset can't load. As close to unbreakable as possible.
 */
export async function renderFallbackGif(theme: ThemeTokens): Promise<Buffer> {
  ensureFontRegistered();

  const width = theme.layout.width * SCALE;
  const height = theme.layout.height * SCALE;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const headerImage = await loadBackgroundImage(FALLBACK_IMAGE_PATH);
  if (headerImage) {
    ctx.drawImage(headerImage, 0, 0, width, height);
  } else {
    ctx.fillStyle = theme.colors.background;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = theme.colors.digits;
    ctx.font = `${theme.typography.digitWeight} ${theme.typography.labelSizePx * SCALE * 1.4}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading offer…', width / 2, height / 2);
  }

  const gif = GIFEncoder();
  const { index, palette } = frameToIndexed(canvas, ctx, null);
  gif.writeFrame(index, width, height, { palette, delay: 0, repeat: -1 });
  gif.finish();
  return Buffer.from(gif.bytesView());
}
