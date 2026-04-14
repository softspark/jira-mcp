import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/cli.ts',
        'src/server.ts',
        'src/connector/jira-connector.ts',
      ],
      thresholds: {
        lines: 70,
        branches: 70,
        functions: 70,
      },
    },
  },
});
