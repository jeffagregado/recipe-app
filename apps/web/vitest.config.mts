import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    include: ['{app,components,features,lib}/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['{app,components,features,lib}/**/*.{ts,tsx}'],
      exclude: [
        '**/*.{test,spec}.{ts,tsx}',
        'components/ui/**',
        // Cached reads and the async grid require the Next.js runtime and E2E tests.
        'features/recipes/api.ts',
        'app/(private)/recipes/components/recipe-grid.tsx',
      ],
    },
  },
});
