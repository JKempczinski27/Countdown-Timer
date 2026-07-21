import { describe, it, expect } from 'vitest';
import {
  zonedWallTimeToUtc,
  toEndParam,
  formatDeadline,
  buildTimerUrl,
  buildCampaign,
  US_ZONES,
} from './deadline';

describe('zonedWallTimeToUtc (DST-correct)', () => {
  it('midnight ET on Aug 1 (EDT, UTC-4) -> 04:00Z', () => {
    const utc = zonedWallTimeToUtc(
      { year: 2026, month: 8, day: 1, hour: 0, minute: 0 },
      'America/New_York',
    );
    expect(toEndParam(utc)).toBe('2026-08-01T04:00:00Z');
  });

  it('midnight ET on Dec 15 (EST, UTC-5) -> 05:00Z', () => {
    const utc = zonedWallTimeToUtc(
      { year: 2026, month: 12, day: 15, hour: 0, minute: 0 },
      'America/New_York',
    );
    expect(toEndParam(utc)).toBe('2026-12-15T05:00:00Z');
  });

  it('9pm PT in summer (PDT, UTC-7) -> next-day 04:00Z', () => {
    const utc = zonedWallTimeToUtc(
      { year: 2026, month: 8, day: 1, hour: 21, minute: 0 },
      'America/Los_Angeles',
    );
    expect(toEndParam(utc)).toBe('2026-08-02T04:00:00Z');
  });

  it('handles the spring-forward transition without drift', () => {
    // 2026-03-08 02:30 ET does not exist (clocks jump 2->3am); the helper
    // must still resolve to a valid instant, not NaN.
    const utc = zonedWallTimeToUtc(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      'America/New_York',
    );
    expect(Number.isNaN(utc.getTime())).toBe(false);
  });
});

describe('formatDeadline', () => {
  it('renders weekday, date, time, and zone label', () => {
    const utc = new Date('2026-08-01T04:00:00Z');
    // 04:00Z is 12:00 AM ET on Aug 1 (a Saturday).
    expect(formatDeadline(utc, US_ZONES.ET)).toBe(
      'Saturday, August 1, 2026 at 12:00 AM ET',
    );
  });

  it('expresses the same instant differently per zone', () => {
    const utc = new Date('2026-08-01T04:00:00Z');
    // Same instant is 9:00 PM PT on July 31.
    expect(formatDeadline(utc, US_ZONES.PT)).toBe(
      'Friday, July 31, 2026 at 9:00 PM PT',
    );
  });
});

describe('buildTimerUrl', () => {
  const end = new Date('2026-08-01T04:00:00Z');

  it('builds a minimal URL and strips trailing slash on origin', () => {
    expect(buildTimerUrl({ origin: 'https://x.dev/', end })).toBe(
      'https://x.dev/api/timer?end=2026-08-01T04:00:00Z',
    );
  });

  it('omits theme when default, includes it otherwise', () => {
    expect(buildTimerUrl({ origin: 'https://x.dev', end, theme: 'default' })).not.toContain(
      'theme=',
    );
    expect(buildTimerUrl({ origin: 'https://x.dev', end, theme: 'goodgood' })).toContain(
      'theme=goodgood',
    );
  });

  it('keeps personalization tokens verbatim (not url-encoded)', () => {
    const url = buildTimerUrl({
      origin: 'https://x.dev',
      end,
      uidExpression: '{{profile.personID}}',
    });
    expect(url).toContain('uid={{profile.personID}}');
  });
});

describe('buildCampaign', () => {
  it('derives url, alt, and live text from one deadline consistently', () => {
    const out = buildCampaign({
      origin: 'https://timer.golfgalaxy.com',
      end: new Date('2026-08-01T04:00:00Z'),
      displayZone: US_ZONES.ET,
      offerName: 'Sale',
      theme: 'goodgood',
      uidExpression: '{{profile.personID}}',
    });
    expect(out.endParam).toBe('2026-08-01T04:00:00Z');
    expect(out.url).toBe(
      'https://timer.golfgalaxy.com/api/timer?end=2026-08-01T04:00:00Z&theme=goodgood&uid={{profile.personID}}',
    );
    expect(out.altText).toBe('Sale ends Saturday, August 1, 2026 at 12:00 AM ET');
    expect(out.liveText).toBe('Ends Saturday, August 1, 2026 at 12:00 AM ET');
    // alt and live text must reference the same instant as the URL.
    expect(out.altText).toContain(out.humanDeadline);
    expect(out.liveText).toContain(out.humanDeadline);
  });

  it('falls back to "Offer" when no offer name given', () => {
    const out = buildCampaign({
      origin: 'https://x.dev',
      end: new Date('2026-08-01T04:00:00Z'),
      displayZone: US_ZONES.ET,
    });
    expect(out.altText.startsWith('Offer ends ')).toBe(true);
  });
});
