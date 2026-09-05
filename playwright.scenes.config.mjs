import { defineConfig } from '@playwright/test';
const port = Number(process.env.SCENE_UI_PORT || 5179);
export default defineConfig({
  testDir: './test/e2e', testMatch: 'scenes.spec.mjs',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  timeout: 15000, expect: { timeout: 4000 }, reporter: 'list',
  webServer: { command: `npm run dev -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
});
