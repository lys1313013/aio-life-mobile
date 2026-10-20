const { defineConfig } = require('@playwright/test');
const { existsSync } = require('node:fs');
const path = require('node:path');

// CI 分片只复用同次工作流构建的产物；本地默认仍构建最终代码。
const prebuilt = process.env.AIO_E2E_PREBUILT === '1';
if (prebuilt && !existsSync(path.join(__dirname, 'dist/build/h5/index.html'))) {
  throw new Error('缺少本次 H5 构建产物，请先构建或下载同次工作流的 h5 artifact。');
}
const workers = Number(process.env.PLAYWRIGHT_WORKERS || 1);
const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5180';
const previewPort = new URL(baseURL).port || '5180';
if (!Number.isInteger(workers) || workers < 1) {
  throw new Error('PLAYWRIGHT_WORKERS 必须为正整数。');
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  // 默认串行；CI 和提交前验证可显式设置并行度，CLI --workers 仍可覆盖。
  workers,
  use: {
    baseURL,
    browserName: 'chromium',
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10000,
  },
  webServer: {
    // 使用生产产物，避免首次访问懒加载页面时 Vite 依赖优化触发整页刷新。
    command: prebuilt
      ? `npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort --outDir dist/build/h5`
      : `npm run build && npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort --outDir dist/build/h5`,
    url: baseURL,
    // 不能误用已运行的开发服务器或上一次构建的预览。
    reuseExistingServer: false,
    timeout: 120000,
  },
});
