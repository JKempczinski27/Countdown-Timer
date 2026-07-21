/**
 * Deadline "preflight" helper: enter a campaign deadline once and get back
 * everything that must stay in sync — the UTC `end` value, the timer URL,
 * the accessibility alt text, and the images-blocked live-text line — so
 * they can't drift apart across the email snippet.
 *
 * All functions are pure and framework-agnostic (they run identically in
 * the browser and on the server), and use the Intl time-zone database so
 * ET/PT/etc. conversions are DST-correct without extra dependencies.
 */

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute?: number;
  second?: number;
}

/** A US zone plus the short label marketing uses for it. */
export interface DisplayZone {
  /** IANA time zone, e.g. 'America/New_York'. */
  timeZone: string;
  /** Short label shown to recipients, e.g. 'ET'. */
  label: string;
}

export const US_ZONES = {
  ET: { timeZone: 'America/New_York', label: 'ET' },
  CT: { timeZone: 'America/Chicago', label: 'CT' },
  MT: { timeZone: 'America/Denver', label: 'MT' },
  PT: { timeZone: 'America/Los_Angeles', label: 'PT' },
} as const satisfies Record<string, DisplayZone>;

export type ZoneKey = keyof typeof US_ZONES;

/** Dynamic lookup by (possibly unknown) key; undefined if not a US zone. */
export function getDisplayZone(key: string): DisplayZone | undefined {
  return (US_ZONES as Record<string, DisplayZone>)[key];
}

/**
 * Offset (ms) such that `wallClockMs = utcMs + offset` for the given
 * instant in the given zone. Positive east of UTC. Derived from Intl so
 * it reflects the real DST rules at that instant.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const f: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') f[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    f.year as number,
    (f.month as number) - 1,
    f.day as number,
    f.hour as number,
    f.minute as number,
    f.second as number,
  );
  return asUtc - utcMs;
}

/**
 * Converts a wall-clock time in a given IANA zone to the UTC instant it
 * represents, correctly accounting for DST. Two-pass offset resolution
 * handles the hour near DST transitions.
 */
export function zonedWallTimeToUtc(wall: WallClock, timeZone: string): Date {
  const naiveUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute ?? 0,
    wall.second ?? 0,
  );
  const offset1 = zoneOffsetMs(naiveUtc, timeZone);
  let utc = naiveUtc - offset1;
  const offset2 = zoneOffsetMs(utc, timeZone);
  if (offset2 !== offset1) {
    utc = naiveUtc - offset2;
  }
  return new Date(utc);
}

/** ISO 8601 UTC with no milliseconds: `2026-08-01T04:00:00Z`. */
export function toEndParam(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Human-readable deadline in a display zone, e.g.
 * "Saturday, August 1, 2026 at 12:00 AM ET".
 */
export function formatDeadline(date: Date, zone: DisplayZone): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: zone.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const month = get('month');
  const day = get('day');
  const year = get('year');
  const hour = get('hour');
  const minute = get('minute');
  const dayPeriod = get('dayPeriod');
  return `${weekday}, ${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod} ${zone.label}`;
}

export interface CampaignInput {
  /** Deployment origin, e.g. 'https://timer.golfgalaxy.com' (no trailing slash). */
  origin: string;
  /** The deadline as a UTC instant. */
  end: Date;
  /** Zone used only for the human-readable copy (alt + live text). */
  displayZone: DisplayZone;
  /** Word for the offer, e.g. 'Sale' -> "Sale ends ...". Default 'Offer'. */
  offerName?: string;
  /** Theme key; omitted when 'default'. */
  theme?: string;
  /**
   * Literal personalization expression for the uid param, kept verbatim
   * (NOT url-encoded) so ESP tokens like {{profile.personID}} survive.
   * Omit to leave uid off entirely.
   */
  uidExpression?: string;
}

export interface CampaignOutput {
  /** The `end` param value. */
  endParam: string;
  /** Ready-to-paste timer image URL. */
  url: string;
  /** WCAG-compliant alt attribute value. */
  altText: string;
  /** Images-blocked live-text line. */
  liveText: string;
  /** Human-readable deadline used in both alt and live text. */
  humanDeadline: string;
}

/** Builds the timer image URL, preserving literal personalization tokens. */
export function buildTimerUrl(input: Pick<CampaignInput, 'origin' | 'end' | 'theme' | 'uidExpression'>): string {
  const endParam = toEndParam(input.end);
  const params: string[] = [`end=${endParam}`];
  if (input.theme && input.theme !== 'default') {
    params.push(`theme=${input.theme}`);
  }
  if (input.uidExpression) {
    params.push(`uid=${input.uidExpression}`);
  }
  const origin = input.origin.replace(/\/+$/, '');
  return `${origin}/api/timer?${params.join('&')}`;
}

/**
 * The single source of truth for a campaign send: URL, alt text, and
 * live-text line all derived from one deadline so they never contradict
 * the timer or each other.
 */
export function buildCampaign(input: CampaignInput): CampaignOutput {
  const humanDeadline = formatDeadline(input.end, input.displayZone);
  const offer = input.offerName?.trim() || 'Offer';
  return {
    endParam: toEndParam(input.end),
    url: buildTimerUrl(input),
    altText: `${offer} ends ${humanDeadline}`,
    liveText: `Ends ${humanDeadline}`,
    humanDeadline,
  };
}
