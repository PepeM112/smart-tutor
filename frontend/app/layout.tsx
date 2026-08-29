import { Geist, Geist_Mono } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { FontSizeProvider } from '@/components/FontSizeProvider';
import { Providers } from '@/components/Providers';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FONT_SIZE_COOKIE, getFontSizeValue } from '@/lib/font-size';
import type { FontSizeId } from '@/lib/font-size';
import { THEME_COOKIE, THEME_STORAGE_KEY } from '@/lib/themes';

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
  // SAFETY: cookie value is set by useFontSizeProvider which only writes valid FontSizeId values
  const fontSize = cookieStore.get(FONT_SIZE_COOKIE)?.value as FontSizeId | undefined;
  const fontSizeStyle = fontSize ? { fontSize: getFontSizeValue(fontSize) } : undefined;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      {...(theme && { 'data-theme': theme })}
      style={fontSizeStyle}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Runs before hydration to prevent dark-mode flash — mirrors next-themes' localStorage check */}
        {!theme && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");if(!s&&window.matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.setAttribute("data-theme","midnight")}}catch(e){}})()`,
            }}
          />
        )}
      </head>
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
