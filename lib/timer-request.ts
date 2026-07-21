/**
 * Pure request-validation logic for GET /api/timer, split out from the
 * route handler so it can be unit-tested without spinning up Next.
 */

/** Accepts ISO 8601 UTC: date + time, optional seconds/millis, Z or +00:00. */
export const ISO_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|\+00:00)$/;

/**
 * Far enough out for any real campaign; blocks nonsense like year 9999
 * which would only waste render work on a pinned "99" days display.
 */
export const MAX_FUTURE_MS = 366 * 24 * 60 * 60 * 1000 * 2; // ~2 years

export type ParsedEnd = { endMs: number } | { error: string };

/**
 * Validates the `end` query parameter. Returns the parsed epoch ms, or a
 * human-readable error string suitable for a plain-text 400. An already-
 * past deadline is intentionally valid — the renderer shows the expired
 * state — so only missing/malformed/too-far values are rejected.
 *
 * `now` is injectable so tests are deterministic; defaults to Date.now().
 */
export function parseEndParam(raw: string | null, now: number = Date.now()): ParsedEnd {
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
  if (endMs - now > MAX_FUTURE_MS) {
    return {
      error: 'The "end" datetime is too far in the future (max ~2 years ahead).',
    };
  }
  return { endMs };
}
