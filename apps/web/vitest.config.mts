import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true, alias: { 'server-only': fileURLToPath(new URL('./test/server-only.ts', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['{app,components,features,lib}/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    // Form tests type about 50 characters through a large form. One of them takes 0.5 s on an idle machine and 3.3 s in CI
    // beside lint, typecheck and build, where it once outlasted the 5 s default (#10).
    testTimeout: 20_000,
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
