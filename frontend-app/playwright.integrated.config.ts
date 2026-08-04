/**
 * Playwright config for INTEGRATED E2E tests.
 * Requires: PostgreSQL kaviar_test running locally, backend + frontend started.
 *
 * Run: TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts
 */
import { defineConfig } from 'playwright/test';

const BACKEND_PORT = 3003;
const FRONTEND_PORT = 5174; // Different port to not conflict with dev
const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/kaviar_test';

export default defineConfig({
  testDir: './tests/e2e-integrated',
  timeout: 45000,
  retries: 0,
  workers: 1, // Sequential to avoid DB conflicts
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `DATABASE_URL="${DATABASE_URL}" JWT_SECRET=e2e-test-secret PORT=${BACKEND_PORT} NODE_ENV=test TZ=America/Sao_Paulo npx tsx src/server.ts`,
      port: BACKEND_PORT,
      cwd: '../backend',
      reuseExistingServer: true,
      timeout: 60000,
      env: {
        DATABASE_URL,
        JWT_SECRET: 'e2e-test-secret',
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'test',
        TZ: 'America/Sao_Paulo',
      },
    },
    {
      command: `npx vite --port ${FRONTEND_PORT}`,
      port: FRONTEND_PORT,
      reuseExistingServer: true,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'finance-integrated',
      testMatch: /\.spec\.ts$/,
    },
  ],
});
