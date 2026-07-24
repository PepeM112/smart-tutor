import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { FontSizeProvider } from '@/components/font-size-provider';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/components/theme-provider';
import { FONT_SIZE_COOKIE, getFontSizeValue } from '@/lib/font-size';
import type { FontSizeId } from '@/lib/font-size';
import { THEME_COOKIE } from '@/lib/themes';

import type { Metadata } from 'next';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'SmartTutor',
  description: 'Your personal learning platform',
  manifest: '/manifest.webmanifest',
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'default',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get(THEME_COOKIE)?.value;
  const fontSize = cookieStore.get(FONT_SIZE_COOKIE)?.value as FontSizeId | undefined;
  const fontSizeStyle = fontSize ? { fontSize: getFontSizeValue(fontSize) } : undefined;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      {...(theme ? { 'data-theme': theme } : {})}
      style={fontSizeStyle}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <FontSizeProvider>
              <Providers>{children}</Providers>
            </FontSizeProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
