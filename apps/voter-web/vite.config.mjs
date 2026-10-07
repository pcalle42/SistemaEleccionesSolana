import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  build: { sourcemap: false, target: 'es2022' },
  define: { global: 'globalThis' },
  resolve: {
    alias: {
      assert: fileURLToPath(new URL('./src/security/assert.ts', import.meta.url)),
      buffer: 'buffer/',
      events: 'events',
    },
  },
  server: { strictPort: true },
  worker: { format: 'es' },
});
