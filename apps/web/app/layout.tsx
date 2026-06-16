import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { LiveBadge } from '@/components/LiveBadge';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'ORR Pulse',
  description: 'Real-time traffic monitoring for Bengaluru Outer Ring Road',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen antialiased font-sans">
        <header className="sticky top-0 z-50 border-b border-surface-overlay bg-surface-raised/80 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[1920px] items-center justify-between px-4 md:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold tracking-tight text-gray-50">
                ORR Pulse
              </h1>
              <span className="hidden text-xs text-gray-400 sm:inline">
                Bengaluru Outer Ring Road
              </span>
            </div>
            <LiveBadge lastUpdated={null} />
          </div>
        </header>
        <main className="mx-auto max-w-[1920px] px-4 py-6 md:px-6 md:py-8 lg:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
