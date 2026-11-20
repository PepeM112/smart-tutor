import { Geist_Mono, Newsreader, Source_Sans_3 } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';

import { FontSizeProvider } from '@/components/FontSizeProvider';
import { Providers } from '@/components/Providers';
import { ThemeProvider } from '@/components/ThemeProvider';
import { FONT_SIZE_COOKIE, getFontSizeValue } from '@/lib/fontSize';
import type { FontSizeId } from '@/lib/fontSize';
import { parseTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from '@/lib/themes';

import type { Metadata, Viewport } from 'next';
import './globals.css';

// Titles. Variable font: one file per style covers every weight.
const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

// UI and body text.
const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
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

// `cover` lets the page draw under the notch, so `env(safe-area-inset-*)` returns real values.
export const viewport: Viewport = {
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  // parseTheme maps a cookie from the old palette system (for example "midnight") to light or dark.
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  // SAFETY: cookie value is set by useFontSizeProvider which only writes valid FontSizeId values
  const fontSize = cookieStore.get(FONT_SIZE_COOKIE)?.value as FontSizeId | undefined;
  const fontSizeStyle = fontSize ? { fontSize: getFontSizeValue(fontSize) } : undefined;
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      {...(theme !== 'system' && { 'data-theme': theme })}
      style={fontSizeStyle}
      className={`${newsreader.variable} ${sourceSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* light and dark are in the cookie, so the server sets data-theme. `system` needs the OS setting, which only the browser knows: this runs before hydration to prevent a flash. */}
        {theme === 'system' && <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />}
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
