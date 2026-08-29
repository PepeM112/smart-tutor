import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Default environment stays 'node' — most test files (e.g. useStreamQueue.test.ts)
// are pure logic with no DOM dependency. A test that mounts a React
// component/hook (renderHook, render) opts into jsdom per-file via a
// `// @vitest-environment jsdom` docblock instead of paying the jsdom cost
// project-wide.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
