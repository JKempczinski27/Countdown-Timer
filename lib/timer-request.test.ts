import { describe, it, expect } from 'vitest';
import { parseEndParam, MAX_FUTURE_MS } from './timer-request';

const NOW = Date.parse('2026-07-21T00:00:00Z');

describe('parseEndParam', () => {
  it('accepts a valid future ISO UTC datetime', () => {
    const r = parseEndParam('2026-08-01T04:00:00Z', NOW);
    expect(r).toEqual({ endMs: Date.parse('2026-08-01T04:00:00Z') });
  });

  it('accepts the +00:00 offset form', () => {
    const r = parseEndParam('2026-08-01T04:00:00+00:00', NOW);
    expect('endMs' in r).toBe(true);
  });

  it('accepts a minute-precision value without seconds', () => {
    expect('endMs' in parseEndParam('2026-08-01T04:00Z', NOW)).toBe(true);
  });

  it('treats an already-past deadline as valid (renderer shows expired)', () => {
    const r = parseEndParam('2020-01-01T00:00:00Z', NOW);
    expect('endMs' in r).toBe(true);
  });

  it('rejects a missing value', () => {
    const r = parseEndParam(null, NOW);
    expect('error' in r && r.error).toMatch(/Missing required/);
  });

  it('rejects a non-ISO / non-UTC value', () => {
    expect('error' in parseEndParam('not-a-date', NOW)).toBe(true);
    // local time without a zone is rejected (must be UTC)
    expect('error' in parseEndParam('2026-08-01T04:00:00', NOW)).toBe(true);
    // non-UTC offset is rejected
    expect('error' in parseEndParam('2026-08-01T04:00:00-04:00', NOW)).toBe(true);
  });

  it('rejects a well-formed but impossible date', () => {
    // matches the pattern but Date.parse yields NaN
    const r = parseEndParam('2026-13-45T99:99:99Z', NOW);
    expect('error' in r).toBe(true);
  });

  it('rejects a deadline too far in the future', () => {
    const tooFar = new Date(NOW + MAX_FUTURE_MS + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const r = parseEndParam(tooFar, NOW);
    expect('error' in r && r.error).toMatch(/too far in the future/);
  });

  it('does not throw on hostile input (long string)', () => {
    expect(() => parseEndParam('x'.repeat(100000), NOW)).not.toThrow();
  });
});
