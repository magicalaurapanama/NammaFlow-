import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@orr-pulse/shared': resolve(__dirname, 'packages/shared/index.ts'),
    },
  },
});
