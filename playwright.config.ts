import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.pw.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3105', browserName: 'chromium' },
  webServer: {
    command: 'npm run start --workspace apps/web -- --port 3105',
    url: 'http://127.0.0.1:3105',
    reuseExistingServer: false,
  },
});
