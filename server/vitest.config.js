import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    hookTimeout: 60_000,
    testTimeout: 20_000,
    include: ['test/**/*.test.js'],
    // Serial: shared in-memory mongo + mongoose singleton. Parallel workers
    // would stomp each other's collections. Keep single-file until we wire
    // per-worker DBs.
    fileParallelism: false,
  },
});
