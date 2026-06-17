import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['worker/lib/**/*.test.js', 'tests/**/*.test.js'],
  },
});