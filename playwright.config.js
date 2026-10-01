const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // 默认串行运行完整业务回归；需要并行时可显式传 --workers。
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'off',
    actionTimeout: 10000,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
