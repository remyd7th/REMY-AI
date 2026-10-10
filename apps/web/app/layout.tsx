import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Shell from '../components/Shell';
import { ThemeProvider, THEME_INIT_SCRIPT } from '../lib/theme';
import { NotificationProvider } from '../lib/notifications';
import { PwaGate } from '../lib/pwa';

export const metadata: Metadata = {
  title: { default: 'Remy AI', template: '%s · Remy AI' },
  description: 'Your intelligent AI work assistant — chat, tasks, calendar, approvals, email and follow-ups.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Remy AI',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Remy AI' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111827',
};

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <ThemeProvider>
          <NotificationProvider>
            <PwaGate>
              <Shell>{children}</Shell>
            </PwaGate>
          </NotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
