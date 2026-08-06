import createNextIntlPlugin from 'next-intl/plugin';

import type { NextConfig } from 'next';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  transpilePackages: ['react-markdown', 'remark-gfm'],
  rewrites: () => [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/api/:path*`,
    },
  ],
};

export default withNextIntl(nextConfig);
