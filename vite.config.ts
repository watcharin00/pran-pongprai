import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; it is a single vendor chunk by design.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
