import Link from 'next/link';
import { CampaignBuilder } from './campaign-builder';

export const metadata = {
  title: 'Campaign Builder — Email Countdown Timer',
};

export default function ToolsPage() {
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: '40px 20px' }}>
      <p style={{ marginTop: 0 }}>
        <Link href="/" style={{ color: '#2563EB', fontSize: 14 }}>
          ← Back to preview
        </Link>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 4 }}>Campaign Builder</h1>
      <p style={{ color: '#6B7280', marginTop: 0, marginBottom: 28 }}>
        Enter a campaign deadline once. This generates the timer URL, the ET/PT→UTC
        conversion, the accessibility alt text, and the images-blocked live-text line — all
        from the same instant, so they can never drift apart or contradict the timer.
      </p>
      <CampaignBuilder />
    </main>
  );
}
