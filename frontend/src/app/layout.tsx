

import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import ConsoleSilencer from "@/components/ConsoleSilencer";
import ThemeProvider from "@/components/ThemeProvider";
import i18n from "@/lib/i18n";
import localFont from 'next/font/local';

const outfit = localFont({
  src: '../../public/fonts/Outfit-VariableFont_wght.ttf',
  display: 'swap',
  variable: '--font-outfit',
});

export const metadata: Metadata = {
  title: i18n.t('metadata.title'),
  description: i18n.t('metadata.description'),
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ]
  }
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
