import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/e2e-integrated/**'],
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npx vite --port 5173',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
