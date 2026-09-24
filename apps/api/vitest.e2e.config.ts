import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    include: ['test/**/*.e2e-spec.ts'],
  },
});
