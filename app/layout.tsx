import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Email Countdown Timer — Preview',
  description: 'Server-generated animated GIF countdown timers for email.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: '#F3F4F6',
          color: '#111827',
        }}
      >
        {children}
      </body>
    </html>
  );
}
