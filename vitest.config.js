import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 10000,
    globals: true,
    include: ['src/tests/**/*.test.js'],
    exclude: [],
  },
});
