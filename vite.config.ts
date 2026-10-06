import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified; it is a single vendor chunk by design.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Phaser in its own file: it rarely changes, so returning players keep it cached across deploys
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
