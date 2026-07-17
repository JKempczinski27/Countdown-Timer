import type { NextRequest } from 'next/server';
import { resolveTheme } from '@/brand.config';
import { renderCountdownGif, renderFallbackGif } from '@/lib/gif';

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

const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|\+00:00)$/;

// Far enough out for any real campaign; blocks nonsense like year 9999
// which would only waste render work on a pinned "99" days display.
const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000 * 2; // ~2 years

function badRequest(message: string): Response {
  return new Response(message, {
    status: 400,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function parseEndParam(raw: string | null): { endMs: number } | { error: string } {
  if (!raw) {
    return {
      error:
        'Missing required "end" parameter. Provide an ISO 8601 UTC datetime, e.g. ?end=2026-08-01T04:00:00Z',
    };
  }
  if (!ISO_UTC_PATTERN.test(raw)) {
    return {
      error: `Invalid "end" parameter "${raw.slice(0, 64)}". Expected ISO 8601 UTC format, e.g. 2026-08-01T04:00:00Z`,
    };
  }
  const endMs = Date.parse(raw);
  if (Number.isNaN(endMs)) {
    return {
      error: `Unparseable "end" datetime "${raw.slice(0, 64)}". Example of a valid value: 2026-08-01T04:00:00Z`,
    };
  }
  if (endMs - Date.now() > MAX_FUTURE_MS) {
    return {
      error: 'The "end" datetime is too far in the future (max ~2 years ahead).',
    };
  }
  return { endMs };
}

export function GET(request: NextRequest): Response {
  const params = request.nextUrl.searchParams;

  const parsed = parseEndParam(params.get('end'));
  if ('error' in parsed) {
    return badRequest(parsed.error);
  }

  // `uid` is accepted purely for per-recipient cache-busting uniqueness in
  // email-client image proxies. It is intentionally never read, logged, or
  // rendered.

  const theme = resolveTheme(params.get('theme'));

  let gifBuffer: Buffer;
  try {
    gifBuffer = renderCountdownGif(parsed.endMs, theme);
  } catch {
    // Internal failure must never surface a broken-image icon in an email.
    try {
      gifBuffer = renderFallbackGif(theme);
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
