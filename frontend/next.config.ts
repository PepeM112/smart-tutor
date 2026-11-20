import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  // The dev indicator sits fixed at the top-right (20px inset) and covers the last header button, so the
  // Playwright specs cannot click it. The error overlay stays.
  devIndicators: false,
  transpilePackages: [
    'react-markdown',
    'remark-gfm',
    '@tiptap/core',
    '@tiptap/react',
    '@tiptap/pm',
    '@tiptap/starter-kit',
    '@tiptap/extension-placeholder',
  ],
  rewrites: () => [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/api/:path*`,
    },
  ],
};

export default withNextIntl(nextConfig);
