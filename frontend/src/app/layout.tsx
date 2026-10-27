

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import ConsoleSilencer from "@/components/ConsoleSilencer";
import ThemeProvider from "@/components/ThemeProvider";
import PWARegistration from "@/components/PWARegistration";
import localFont from 'next/font/local';

const outfit = localFont({
  src: '../../public/fonts/Outfit-VariableFont_wght.ttf',
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: 'Flowcast | Filmes, séries e TV',
  description: 'Assista a filmes, séries e canais no Flowcast.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/flowcast-icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/flowcast-apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ]
  },
  appleWebApp: {
    capable: true,
    title: 'Flowcast',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#080a11',
};

export default function RootLayout({
  children }: Readonly<{
    children: React.ReactNode;
  }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.className} ${outfit.variable} antialiased`} suppressHydrationWarning>
        {/* Silence noisy console logs in production */}
        <ConsoleSilencer />
        {/* Apply stored/system theme & custom palettes */}
        <ThemeProvider />
        <PWARegistration />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
