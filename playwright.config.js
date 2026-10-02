const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  // 默认串行运行完整业务回归；需要并行时可显式传 --workers。
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10000,
  },
  webServer: {
    // 使用生产产物，避免首次访问懒加载页面时 Vite 依赖优化触发整页刷新。
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:5180',
    // 不能误用已运行的开发服务器或上一次构建的预览。
    reuseExistingServer: false,
    timeout: 120000,
  },
});
