import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite 8 reads the legacy decorator and metadata options from tsconfig.json.
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/main.ts'],
    },
  },
});
