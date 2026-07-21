'use client';

import { useMemo, useState } from 'react';
import {
  buildCampaign,
  zonedWallTimeToUtc,
  US_ZONES,
  getDisplayZone,
  type WallClock,
} from '@/lib/deadline';

const ZONE_KEYS = Object.keys(US_ZONES);

/** Parses a datetime-local value ("YYYY-MM-DDTHH:MM") into wall-clock fields. */
function parseLocalInput(value: string): WallClock | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

const boxStyle: React.CSSProperties = {
  background: '#FFFFFF',
  borderRadius: 8,
  padding: 24,
  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid #D1D5DB',
  borderRadius: 6,
  boxSizing: 'border-box',
};

function OutputRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...labelStyle, marginBottom: 2 }}>{label}</div>
      <code
        style={{
          display: 'block',
          padding: '8px 12px',
          background: '#F9FAFB',
          border: '1px solid #E5E7EB',
          borderRadius: 6,
          fontSize: 13,
          wordBreak: 'break-all',
          userSelect: 'all',
          color: '#111827',
        }}
      >
        {value}
      </code>
    </div>
  );
}

export function CampaignBuilder() {
  const [offerName, setOfferName] = useState('Sale');
  const [localValue, setLocalValue] = useState('');
  const [zoneKey, setZoneKey] = useState('ET');
  const [origin, setOrigin] = useState('https://YOUR-DEPLOYMENT.vercel.app');
  const [theme, setTheme] = useState('default');
  const [landingUrl, setLandingUrl] = useState('https://YOUR-LANDING-PAGE.example.com');
  const [uidExpression, setUidExpression] = useState('{{profile.personID}}');

  const result = useMemo(() => {
    const wall = parseLocalInput(localValue);
    const zone = getDisplayZone(zoneKey);
    if (!wall || !zone) return null;
    const end = zonedWallTimeToUtc(wall, zone.timeZone);
    if (Number.isNaN(end.getTime())) return null;
    return buildCampaign({
      origin,
      end,
      displayZone: zone,
      offerName,
      theme,
      uidExpression: uidExpression.trim() || undefined,
    });
  }, [localValue, zoneKey, origin, theme, landingUrl, offerName, uidExpression]);

  const snippet = result
    ? `<a href="${landingUrl}" target="_blank" style="text-decoration:none;">
  <img
    src="${result.url}"
    width="320" height="90"
    alt="${result.altText}"
    style="display:block; border:0; outline:none; text-decoration:none;"
  />
</a>
<!-- images-off / accessibility fallback line -->
<a href="${landingUrl}" target="_blank" style="color:#111111;">${result.liveText} &rarr;</a>`
    : '';

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>1. Enter the deadline once</h2>
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label style={labelStyle}>Offer name</label>
            <input
              style={inputStyle}
              value={offerName}
              onChange={(e) => setOfferName(e.target.value)}
              placeholder="Sale"
            />
          </div>
          <div>
            <label style={labelStyle}>Timezone (of the deadline you type)</label>
            <select style={inputStyle} value={zoneKey} onChange={(e) => setZoneKey(e.target.value)}>
              {ZONE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k} — {getDisplayZone(k)?.timeZone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Deadline (wall-clock in that timezone)</label>
            <input
              type="datetime-local"
              step={60}
              style={inputStyle}
              value={localValue}
              onChange={(e) => setLocalValue(e.target.value)}
            />
          </div>
          <div>
            <label style={labelStyle}>Theme</label>
            <select style={inputStyle} value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="default">default (Golf Galaxy)</option>
              <option value="goodgood">goodgood (Good Good Open)</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Deployment origin</label>
            <input style={inputStyle} value={origin} onChange={(e) => setOrigin(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Landing page URL</label>
            <input
              style={inputStyle}
              value={landingUrl}
              onChange={(e) => setLandingUrl(e.target.value)}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>uid personalization expression (ESP token, left verbatim)</label>
            <input
              style={inputStyle}
              value={uidExpression}
              onChange={(e) => setUidExpression(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section style={boxStyle}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>2. Copy the pieces (all derived from that one deadline)</h2>
        {result ? (
          <>
            <div
              style={{
                background: '#ECFDF5',
                border: '1px solid #A7F3D0',
                borderRadius: 6,
                padding: '10px 12px',
                fontSize: 14,
                color: '#065F46',
                marginBottom: 16,
              }}
            >
              Resolves to <strong>{result.humanDeadline}</strong> ={' '}
              <strong>{result.endParam}</strong> (UTC).
            </div>
            <OutputRow label="Timer image URL" value={result.url} />
            <OutputRow label="alt text (accessibility / WCAG 1.1.1)" value={result.altText} />
            <OutputRow label="Live-text fallback line" value={result.liveText} />
            <div style={{ ...labelStyle, marginTop: 4 }}>
              Ready-to-paste email block (image + fallback line)
            </div>
            <pre
              style={{
                margin: 0,
                padding: '12px',
                background: '#0B1220',
                color: '#E5E7EB',
                borderRadius: 6,
                fontSize: 12.5,
                overflowX: 'auto',
                userSelect: 'all',
              }}
            >
              {snippet}
            </pre>
          </>
        ) : (
          <p style={{ color: '#6B7280', fontSize: 14, margin: 0 }}>
            Pick a deadline above to generate the URL, alt text, live-text line, and email
            block.
          </p>
        )}
      </section>
    </div>
  );
}
