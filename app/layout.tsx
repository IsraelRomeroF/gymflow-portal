import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SCRIPT_TEMA } from '@/components/tema';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'GymFlow', template: '%s · GymFlow' },
  description: 'Tu membresía, tus clases y tus pagos',
  manifest: '/manifest.webmanifest',
  // Ícono de verdad en la pantalla de inicio y en la pestaña (UX5-P-04).
  icons: { icon: '/favicon-32.png', apple: '/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'GymFlow' },
};

/** `viewportFit: cover` para aprovechar la pantalla completa en teléfonos con muesca. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
