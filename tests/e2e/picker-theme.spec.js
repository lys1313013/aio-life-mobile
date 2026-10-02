const { test, expect } = require('@playwright/test');
const { setup } = require('./qa-domains-fixtures');

function contrast(a, b) {
  const luminance = value => value.match(/[\d.]+/g).slice(0, 3)
    .map(Number).map(v => v / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

async function prepare(page, baseURL, mode, colorScheme) {
  await page.emulateMedia({ colorScheme });
  await page.addInitScript(value => localStorage.setItem('aio-life-mobile.theme.v1', value), mode);
  await setup(page, baseURL);
  await page.route('https://api.github.com/users/*/repos?*', route => route.fulfill({ json: [
    { id: 1, name: 'mobile-demo', full_name: 'fixture/mobile-demo', description: '移动客户端示例仓库', language: 'JavaScript', stargazers_count: 12, forks_count: 2, pushed_at: '2026-10-01' },
    { id: 2, name: 'life-demo', full_name: 'fixture/life-demo', description: '生活记录示例仓库', language: 'TypeScript', stargazers_count: 3, forks_count: 1, pushed_at: '2026-09-30' },
  ] }));
}

async function checkWheel(page, dark) {
  const content = page.locator('.uni-picker-content:visible');
  await expect(content).toBeVisible();
  const colors = await content.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      text: getComputedStyle(node.querySelector('.uni-picker-item')).color,
      mask: getComputedStyle(node.querySelector('.uni-picker-view-mask')).backgroundImage,
    };
  });
  expect(colors.background).toBe(dark ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)');
  expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
  expect(colors.mask).toContain(dark ? 'rgba(28, 30, 34,' : 'rgba(255, 255, 255,');
  const header = page.locator('.uni-picker-header:visible');
  await expect(header).toHaveCSS('background-color', colors.background);
  for (const action of await header.locator('.uni-picker-action').all()) {
    expect(contrast(await action.evaluate(n => getComputedStyle(n).color), colors.background)).toBeGreaterThanOrEqual(4.5);
  }
}

for (const width of [390, 768, 1440]) {
  for (const [colorScheme, mode] of [['dark', 'light'], ['light', 'dark'], ['dark', 'system'], ['light', 'system']]) {
    test(`选择器可读性 ${width} 系统${colorScheme} 应用${mode}`, async ({ page, baseURL }) => {
      await page.setViewportSize({ width, height: 844 });
      await prepare(page, baseURL, mode, colorScheme);
      await page.goto('/#/pages/coding/github');
      const field = page.locator('uni-picker[aria-label="排序"]');
      await field.click();
      await page.waitForTimeout(350);
      const dark = mode === 'system' ? colorScheme === 'dark' : mode === 'dark';
      if (width < 500) {
        await checkWheel(page, dark);
        // 等待入场动画后，用滚轮改变选项并确认，验证样式没有遮住交互。
        await page.locator('.uni-picker-content:visible .uni-picker-view-group').hover();
        await page.mouse.wheel(0, 34);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `artifacts/picker-theme/${width}-${colorScheme}-${mode}.png` });
        await page.locator('.uni-picker-action-confirm:visible').click();
      } else {
        const list = page.locator('.uni-picker-select:visible');
        await expect(list).toBeVisible();
        const background = await list.evaluate(n => getComputedStyle(n).backgroundColor);
        expect(background).toBe(dark ? 'rgb(28, 30, 34)' : 'rgb(255, 255, 255)');
        const option = list.getByText('Star', { exact: true });
        expect(contrast(await option.evaluate(n => getComputedStyle(n).color), background)).toBeGreaterThanOrEqual(4.5);
        const selected = list.locator('.selected');
        const selectedColors = await selected.evaluate(n => ({ text: getComputedStyle(n).color, background: getComputedStyle(n).backgroundColor }));
        expect(contrast(selectedColors.text, selectedColors.background)).toBeGreaterThanOrEqual(4.5);
        await page.screenshot({ path: `artifacts/picker-theme/${width}-${colorScheme}-${mode}.png` });
        await option.click();
      }
      await expect(field).toContainText('Star');
    });
  }
}

for (const mode of ['light', 'dark']) {
  test(`日期和时间滚轮 应用${mode} 系统相反主题`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page, baseURL, mode, mode === 'light' ? 'dark' : 'light');
    await page.route('**/api/timeRecord/recommendNext?*', route => route.fulfill({ json: {
      rscode: '0', data: { records: [], recommend: { categoryId: '1', startTime: 600, endTime: 659 } },
    } }));
    await page.goto('/#/pages/time/index');
    await page.getByRole('button', { name: '新增时迹', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '记录时间', exact: true });
    for (const label of ['记录日期', '开始时间']) {
      await dialog.locator(`uni-picker[aria-label="${label}"]`).click();
      await page.waitForTimeout(350);
      await checkWheel(page, mode === 'dark');
      await page.screenshot({ path: `artifacts/picker-theme/${label}-${mode}.png` });
      await page.locator('.uni-picker-action-cancel:visible').click();
      await expect(dialog).toBeVisible();
      await expect(page.locator('.uni-picker-content:visible')).toHaveCount(0);
    }
  });
}
