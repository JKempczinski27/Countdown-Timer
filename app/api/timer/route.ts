import type { NextRequest } from 'next/server';
import { resolveTheme } from '@/brand.config';
import { renderCountdownGif, renderFallbackGif } from '@/lib/gif';
import { parseEndParam } from '@/lib/timer-request';

// @napi-rs/canvas is a native binding — must run on the Node.js runtime,
// not Edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Shared-cache headers, NOT no-store: a countdown for a given deadline is
 * identical for every recipient within the same second, so a 1-second CDN
 * TTL collapses high-volume opens to ~1 origin render per second per
 * deadline+theme. See README for the full rationale.
 */
const CACHE_CONTROL = 'public, max-age=1, s-maxage=1, stale-while-revalidate=5';

function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;

  const parsed = parseEndParam(params.get('end'));
  if ('error' in parsed) {
    return badRequest(parsed.error);
  }

  // `uid` is accepted purely for per-recipient cache-busting uniqueness in
  // email-client image proxies. It is intentionally never read, logged, or
  // rendered.

  const theme = resolveTheme(params.get('theme'));

  // `style` overrides the theme's default; anything unrecognized falls
  // back to the theme default (or 'flat').
  const styleParam = params.get('style');
  const style: 'flat' | 'flip' =
    styleParam === 'flip' ? 'flip' : styleParam === 'flat' ? 'flat' : (theme.style ?? 'flat');

  let gifBuffer: Buffer;
  try {
    gifBuffer = await renderCountdownGif(parsed.endMs, theme, style);
  } catch {
    // Internal failure must never surface a broken-image icon in an email.
    try {
      gifBuffer = await renderFallbackGif(theme);
    } catch {
      // Hand-rolled 1x1 black GIF: the absolute last resort.
      gifBuffer = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
    }
  }

  return new Response(new Uint8Array(gifBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(gifBuffer.byteLength),
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
