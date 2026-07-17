'use client';

import { useState } from 'react';

function toIsoUtc(localValue: string): string | null {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function PreviewControls() {
  const [localValue, setLocalValue] = useState('');
  const [applied, setApplied] = useState<string | null>(null);

  const isoUtc = toIsoUtc(localValue);
  const url = applied ? `/api/timer?end=${encodeURIComponent(applied)}` : null;

  return (
    <section
      style={{
        background: '#FFFFFF',
        borderRadius: 8,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: 18 }}>Try any deadline</h2>
      <p style={{ color: '#6B7280', fontSize: 14 }}>
        Pick a date and time (interpreted in your local timezone, converted to UTC for the
        URL), then apply to preview.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="datetime-local"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          step={1}
          style={{
            padding: '8px 12px',
            fontSize: 15,
            border: '1px solid #D1D5DB',
            borderRadius: 6,
          }}
        />
        <button
          type="button"
          disabled={!isoUtc}
          onClick={() => setApplied(isoUtc)}
          style={{
            padding: '8px 16px',
            fontSize: 15,
            border: 0,
            borderRadius: 6,
            background: isoUtc ? '#111827' : '#9CA3AF',
            color: '#FFFFFF',
            cursor: isoUtc ? 'pointer' : 'not-allowed',
          }}
        >
          Apply
        </button>
      </div>
      {url && applied && (
        <div style={{ marginTop: 20 }}>
          {/* key forces a fresh request each time Apply is clicked */}
          <img
            key={url}
            src={url}
            width={320}
            height={90}
            alt={`Countdown to ${applied}`}
            style={{ display: 'block', border: 0 }}
          />
          <code
            style={{
              display: 'block',
              marginTop: 10,
              padding: '8px 12px',
              background: '#F9FAFB',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 13,
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {url}
          </code>
        </div>
      )}
    </section>
  );
}
