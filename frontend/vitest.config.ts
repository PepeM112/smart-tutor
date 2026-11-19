import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Default environment stays 'node' — most test files (e.g. useStreamQueue.test.ts)
// are pure logic with no DOM dependency. A test that mounts a React
// component/hook (renderHook, render) opts into jsdom per-file via a
// `// @vitest-environment jsdom` docblock instead of paying the jsdom cost
// project-wide.
// Node 25 ships an experimental `localStorage` that shadows the jsdom one. The flag turns it off, but
// Node 20 (the frontend container) rejects an unknown flag, so pass it only where it exists.
const WEBSTORAGE_FLAG = '--no-experimental-webstorage';
const execArgv = process.allowedNodeEnvironmentFlags.has(WEBSTORAGE_FLAG) ? [WEBSTORAGE_FLAG] : [];

export default defineConfig({
  test: { execArgv },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
