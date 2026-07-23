import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { GIFEncoder, quantize, applyPalette, type PaletteColor } from 'gifenc';
import type { ThemeTokens } from '@/brand.config';
import { ensureFontRegistered, FONT_FAMILY } from './fonts';

/** Draw at 2x logical size so digits stay crisp in email clients. */
const SCALE = 2;
const SECONDS_WINDOW = 60; // seconds of ticking rendered per request
const SECOND_MS = 1000;
// Per flip sub-frame. 50ms lands on an exact GIF centisecond (5cs) so
// hold + flip frames sum to precisely 1000ms/second (no rounding drift),
// and it stays at/above most email clients' minimum frame-delay clamp.
const FLIP_STEP_MS = 50;
const MAX_DISPLAY_DAYS = 99;

/** Reserved transparent sentinel color; far from any navy/white content. */
const TRANSPARENT_RGB: PaletteColor = [255, 0, 255];

interface FlipStyle {
  kicker: string;
  bgTop: string;
  bgBottom: string;
  cardTop: string;
  cardBottom: string;
  cardLower: string;
  flipSteps: number;
}

function resolveFlipStyle(theme: ThemeTokens): FlipStyle {
  const f = theme.flip ?? {};
  return {
    kicker: f.kicker ?? '',
    bgTop: f.bgTop ?? '#123A5C',
    bgBottom: f.bgBottom ?? '#0B2947',
    cardTop: f.cardTop ?? '#1E4A6E',
    cardBottom: f.cardBottom ?? '#15385A',
    cardLower: f.cardLower ?? '#123353',
    flipSteps: Math.min(8, Math.max(2, f.flipSteps ?? 4)),
  };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

interface Cell {
  value: string;
  label: string;
}

function cellsFor(remaining: number, showDays: boolean): Cell[] {
  const total = Math.max(0, remaining);
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  if (showDays) {
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

/** Geometry for the card row, derived so it scales with logical size. */
interface Geometry {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  gap: number;
  yTop: number;
  seamOf: (y: number) => number;
  digitPx: number;
  kickerPx: number;
  labelPx: number;
  count: number;
  x0: number;
}

function geometryFor(theme: ThemeTokens, count: number): Geometry {
  const width = theme.layout.width * SCALE;
  const height = theme.layout.height * SCALE;
  const sx = width / 640;
  const sy = height / 180;
  const cardW = 104 * sx;
  const cardH = 78 * sy;
  const gap = 18 * sx;
  const totW = count * cardW + (count - 1) * gap;
  return {
    width,
    height,
    cardW,
    cardH,
    gap,
    yTop: 48 * sy,
    seamOf: (yTop) => yTop + cardH / 2,
    digitPx: 46 * sy,
    kickerPx: 12 * sy,
    labelPx: 11 * sy,
    count,
    x0: (width - totW) / 2,
  };
}

function roundRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTracked(
  ctx: SKRSContext2D,
  text: string,
  centerX: number,
  y: number,
  size: number,
  color: string,
  trackingPx: number,
): void {
  ctx.font = `bold ${size}px ${FONT_FAMILY}`;
  ctx.fillStyle = color;
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + trackingPx * Math.max(0, text.length - 1);
  let x = centerX - totalWidth / 2;
  ctx.textAlign = 'left';
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i] as string, x, y);
    x += (widths[i] as number) + trackingPx;
  }
  ctx.textAlign = 'center';
}

/** Renders a full static frame (all cards showing their current values). */
function drawBoard(
  ctx: SKRSContext2D,
  geo: Geometry,
  style: FlipStyle,
  theme: ThemeTokens,
  cells: Cell[],
): void {
  const bg = ctx.createLinearGradient(0, 0, 0, geo.height);
  bg.addColorStop(0, style.bgTop);
  bg.addColorStop(1, style.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, geo.width, geo.height);

  if (style.kicker) {
    drawTracked(
      ctx,
      style.kicker,
      geo.width / 2,
      geo.yTop - 18 * (geo.height / 180),
      geo.kickerPx,
      'rgba(255,255,255,0.6)',
      3 * (geo.width / 640),
    );
  }

  for (let i = 0; i < cells.length; i++) {
    const x = geo.x0 + i * (geo.cardW + geo.gap);
    drawCardStatic(ctx, geo, style, theme, x, cells[i] as Cell);
  }
}

function drawCardBase(
  ctx: SKRSContext2D,
  geo: Geometry,
  style: FlipStyle,
  x: number,
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  roundRect(ctx, x + 2, geo.yTop + 4, geo.cardW, geo.cardH, 10);
  ctx.fill();
  const cg = ctx.createLinearGradient(0, geo.yTop, 0, geo.yTop + geo.cardH);
  cg.addColorStop(0, style.cardTop);
  cg.addColorStop(0.499, style.cardBottom);
  cg.addColorStop(0.5, style.cardLower);
  cg.addColorStop(1, style.cardBottom);
  ctx.fillStyle = cg;
  roundRect(ctx, x, geo.yTop, geo.cardW, geo.cardH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, geo.yTop + 0.5, geo.cardW - 1, geo.cardH - 1, 10);
  ctx.stroke();
}

function drawHalf(
  ctx: SKRSContext2D,
  geo: Geometry,
  x: number,
  value: string,
  digitColor: string,
  half: 'top' | 'bottom',
  scaleY: number,
): void {
  const seam = geo.seamOf(geo.yTop);
  ctx.save();
  if (half === 'top') roundRect(ctx, x, geo.yTop, geo.cardW, geo.cardH / 2, 10);
  else roundRect(ctx, x, seam, geo.cardW, geo.cardH / 2, 10);
  ctx.clip();
  ctx.translate(0, seam);
  ctx.scale(1, scaleY);
  ctx.translate(0, -seam);
  ctx.fillStyle = digitColor;
  ctx.font = `bold ${geo.digitPx}px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value, x + geo.cardW / 2, seam + 1);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';

  const shade = (1 - scaleY) * 0.45;
  if (shade > 0.01) {
    ctx.save();
    if (half === 'top') roundRect(ctx, x, geo.yTop, geo.cardW, geo.cardH / 2, 10);
    else roundRect(ctx, x, seam, geo.cardW, geo.cardH / 2, 10);
    ctx.clip();
    ctx.fillStyle = `rgba(0,10,20,${shade})`;
    ctx.fillRect(x, geo.yTop, geo.cardW, geo.cardH);
    ctx.restore();
  }
}

function drawSeam(ctx: SKRSContext2D, geo: Geometry, x: number): void {
  const seam = geo.seamOf(geo.yTop);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, seam);
  ctx.lineTo(x + geo.cardW, seam);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, seam + 1);
  ctx.lineTo(x + geo.cardW, seam + 1);
  ctx.stroke();
}

function drawLabel(
  ctx: SKRSContext2D,
  geo: Geometry,
  x: number,
  label: string,
): void {
  drawTracked(
    ctx,
    label,
    x + geo.cardW / 2,
    geo.yTop + geo.cardH + 20 * (geo.height / 180),
    geo.labelPx,
    'rgba(255,255,255,0.55)',
    1.5 * (geo.width / 640),
  );
}

function drawCardStatic(
  ctx: SKRSContext2D,
  geo: Geometry,
  style: FlipStyle,
  theme: ThemeTokens,
  x: number,
  cell: Cell,
): void {
  drawCardBase(ctx, geo, style, x);
  drawHalf(ctx, geo, x, cell.value, theme.colors.digits, 'top', 1);
  drawHalf(ctx, geo, x, cell.value, theme.colors.digits, 'bottom', 1);
  drawSeam(ctx, geo, x);
  drawLabel(ctx, geo, x, cell.label);
}

/** Renders one card mid-flip from `oldV` to `newV` at progress t (0..1). */
function drawCardFlipping(
  ctx: SKRSContext2D,
  geo: Geometry,
  style: FlipStyle,
  theme: ThemeTokens,
  x: number,
  oldV: string,
  newV: string,
  label: string,
  t: number,
): void {
  const dig = theme.colors.digits;
  drawCardBase(ctx, geo, style, x);
  if (t < 0.5) {
    const s = Math.cos((t / 0.5) * (Math.PI / 2)); // 1 -> 0
    drawHalf(ctx, geo, x, newV, dig, 'top', 1);
    drawHalf(ctx, geo, x, oldV, dig, 'bottom', 1);
    drawHalf(ctx, geo, x, oldV, dig, 'top', s);
  } else {
    const s = Math.cos((1 - (t - 0.5) / 0.5) * (Math.PI / 2)); // 0 -> 1
    drawHalf(ctx, geo, x, newV, dig, 'top', 1);
    drawHalf(ctx, geo, x, oldV, dig, 'bottom', 1);
    drawHalf(ctx, geo, x, newV, dig, 'bottom', s);
  }
  drawSeam(ctx, geo, x);
  drawLabel(ctx, geo, x, label);
}

function drawExpiredBoard(
  ctx: SKRSContext2D,
  geo: Geometry,
  style: FlipStyle,
  theme: ThemeTokens,
): void {
  const bg = ctx.createLinearGradient(0, 0, 0, geo.height);
  bg.addColorStop(0, style.bgTop);
  bg.addColorStop(1, style.bgBottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, geo.width, geo.height);
  const size = geo.digitPx * 0.72;
  ctx.font = `bold ${size}px ${FONT_FAMILY}`;
  const msg = theme.expired.message;
  const maxW = geo.width * 0.9;
  const w = ctx.measureText(msg).width;
  const fit = Math.min(1, maxW / w);
  ctx.textBaseline = 'middle';
  drawTracked(ctx, msg, geo.width / 2, geo.height / 2, size * fit, theme.colors.expiredText, 2);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Encodes frames with a shared global palette and 1-bit transparency:
 * after the first frame, pixels identical to what's already on screen are
 * written as the transparent index (disposal = leave-in-place), so long
 * unchanged runs compress to almost nothing. This keeps a 60-second flip
 * animation small despite gifenc having no partial-frame support.
 */
class DiffEncoder {
  private gif = GIFEncoder();
  private prev: Uint8Array | null = null;
  private transparentIndex: number;

  constructor(
    private width: number,
    private height: number,
    private palette: PaletteColor[],
  ) {
    this.transparentIndex = palette.length - 1;
  }

  addFrame(rgba: Uint8ClampedArray, delayMs: number): void {
    const idx = applyPalette(rgba, this.palette);
    if (this.prev === null) {
      this.gif.writeFrame(idx, this.width, this.height, {
        palette: this.palette,
        delay: delayMs,
        repeat: -1, // play once, then freeze on the final frame
        dispose: 1, // leave frame in place for the next to draw over
      });
      this.prev = idx.slice();
      return;
    }
    const out = idx.slice();
    const prev = this.prev;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === prev[i]) {
        out[i] = this.transparentIndex;
      } else {
        prev[i] = out[i] as number;
      }
    }
    this.gif.writeFrame(out, this.width, this.height, {
      delay: delayMs,
      transparent: true,
      transparentIndex: this.transparentIndex,
      dispose: 1,
    });
  }

  finish(): Buffer {
    this.gif.finish();
    return Buffer.from(this.gif.bytesView());
  }
}

/**
 * Renders the split-flap flip-clock countdown. Ticks for up to 60 seconds,
 * flipping only the digit cards whose value changes each tick; timing per
 * second sums to exactly 1000ms so the countdown stays real-time accurate.
 * Plays once and freezes on the final value / expired message.
 */
export function renderFlipCountdownGif(endMs: number, theme: ThemeTokens): Buffer {
  ensureFontRegistered();
  const style = resolveFlipStyle(theme);
  const showDays = theme.layout.showDays;
  const count = cellsFor(0, showDays).length;
  const geo = geometryFor(theme, count);

  const canvas = createCanvas(geo.width, geo.height);
  const ctx = canvas.getContext('2d');

  const initialRemaining = Math.floor((endMs - Date.now()) / 1000);

  // Build a shared palette from representative frames (an initial board and
  // a mid-flip board, which introduces the fold-shadow shades), then reserve
  // the last slot as the transparent sentinel.
  const sample = (draw: () => void): Uint8ClampedArray => {
    draw();
    return ctx.getImageData(0, 0, geo.width, geo.height).data;
  };
  const firstCells = cellsFor(Math.max(initialRemaining, 0), showDays);
  const a = sample(() => drawBoard(ctx, geo, style, theme, firstCells));
  const b = sample(() => {
    drawBoard(ctx, geo, style, theme, firstCells);
    // one flipping SEC card to capture shadow tones
    const x = geo.x0 + (count - 1) * (geo.cardW + geo.gap);
    drawCardFlipping(ctx, geo, style, theme, x, '09', '08', 'SEC', 0.4);
  });
  const merged = new Uint8ClampedArray(a.length + b.length);
  merged.set(a, 0);
  merged.set(b, a.length);
  const palette = quantize(merged, 255);
  palette.push(TRANSPARENT_RGB);

  const encoder = new DiffEncoder(geo.width, geo.height, palette);
  const flipMs = style.flipSteps * FLIP_STEP_MS;
  const holdMs = Math.max(0, SECOND_MS - flipMs);

  for (let i = 0; i < SECONDS_WINDOW; i++) {
    const remaining = initialRemaining - i;
    if (remaining <= 0) {
      drawExpiredBoard(ctx, geo, style, theme);
      encoder.addFrame(ctx.getImageData(0, 0, geo.width, geo.height).data, SECOND_MS);
      break;
    }

    const cells = cellsFor(remaining, showDays);
    drawBoard(ctx, geo, style, theme, cells);
    encoder.addFrame(ctx.getImageData(0, 0, geo.width, geo.height).data, holdMs);

    const next = remaining - 1;
    if (next <= 0) {
      // Last second: after the hold, cut to the expired message.
      drawExpiredBoard(ctx, geo, style, theme);
      encoder.addFrame(ctx.getImageData(0, 0, geo.width, geo.height).data, flipMs);
      break;
    }

    const nextCells = cellsFor(next, showDays);
    for (let k = 1; k <= style.flipSteps; k++) {
      const t = k / style.flipSteps;
      drawBoard(ctx, geo, style, theme, cells); // static base
      for (let c = 0; c < cells.length; c++) {
        const oldV = (cells[c] as Cell).value;
        const newV = (nextCells[c] as Cell).value;
        if (oldV !== newV) {
          const x = geo.x0 + c * (geo.cardW + geo.gap);
          drawCardFlipping(ctx, geo, style, theme, x, oldV, newV, (cells[c] as Cell).label, t);
        }
      }
      encoder.addFrame(ctx.getImageData(0, 0, geo.width, geo.height).data, FLIP_STEP_MS);
    }
  }

  return encoder.finish();
}
