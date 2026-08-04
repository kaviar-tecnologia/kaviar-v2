import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['tests/**/*.test.{js,ts,jsx,tsx}'],
    exclude: ['tests/**/*.spec.{js,ts,jsx,tsx}', 'tests/e2e-integrated/**'],
  },
});
