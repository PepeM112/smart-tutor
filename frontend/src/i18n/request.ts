import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, type Locale, locales } from './config';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get('locale')?.value;
  const locale: Locale = raw && (locales as readonly string[]).includes(raw) ? (raw as Locale) : defaultLocale;

  return {
    locale,
    // Dynamic import is unavoidable for locale-based message loading
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
