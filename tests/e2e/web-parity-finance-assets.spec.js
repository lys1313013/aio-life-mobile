const { test, expect } = require('@playwright/test'),
  fs = require('node:fs');
const { setup } = require('./qa-domains-fixtures');
const out = 'artifacts/web-parity-finance-assets';
const devices = [1, 2, 3].map((n) => ({
  id: String(n),
  name: `模拟设备 ${n}`,
  spec: '模拟配置及说明',
  status: String(n),
  type: '81',
  fileId: 'photo-' + n,
  purchaseDate: '2026-09-01',
  purchasePrice: 1200 * n,
}));
const members = [1, 2, 3].map((n) => ({
  id: String(n),
  name: `模拟订阅 ${n}`,
  category: 'video',
  startDate: '2026-09-01',
  expiryDate: '2026-10-20',
  status: ['active', 'expiring', 'expired'][n - 1],
  remainingDays: n === 3 ? -2 : 20,
  price: 60,
  monthlyAmount: 20,
  billingCycle: 'quarter',
  autoRenew: 0,
}));
const clothes = [1, 2, 3].map((n) => ({
  id: String(n),
  name: `模拟衣物 ${n}`,
  categoryId: '81',
  categoryName: '上衣',
  color: '蓝',
  brand: '模拟品牌',
  size: 'M',
  season: '春,秋',
  price: 80,
  fileId: 'photo-' + n,
}));
async function fixture(p) {
  await setup(p);
  const map = {
    '/device/query': { items: devices, total: 3 },
    '/membership/list': members,
    '/membership/stats': {
      activeCount: 1,
      expiringCount: 1,
      expiringThisMonthCount: 1,
      monthlyAmount: 40,
    },
    '/wardrobe/items': clothes,
    '/wardrobe/items/1': clothes[0],
    '/wardrobe/categories': [{ id: '81', name: '上衣', parentId: '0', categoryType: 0 }],
    '/wardrobe/stats': {
      totalCount: 3,
      totalValue: 240,
      avgPrice: 80,
      seasonCount: { 春: 3, 秋: 3 },
    },
  };
  for (const [path, data] of Object.entries(map))
    await p.route('**/api' + path + (path.includes('query') ? '?*' : ''), (r) =>
      r.fulfill({ json: { rscode: '0', data } }),
    );
  await p.route('**/api/file/preview/*', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="300" height="180" fill="#dfe9f8"/><rect x="80" y="30" width="140" height="120" rx="12" fill="#718db5"/></svg>',
    }),
  );
}
for (const width of [390, 768, 1440])
  for (const theme of ['light', 'dark'])
    test(`财务资产Web对照 H5模拟 ${width} ${theme}`, async ({ page: p }) => {
      test.setTimeout(90000);
      fs.mkdirSync(out, { recursive: true });
      await p.setViewportSize({ width, height: 900 });
      await p.emulateMedia({ colorScheme: theme });
      await fixture(p);
      for (const [route, ready, edit] of [
        ['goods/devices', '模拟设备 1', '编辑设备'],
        ['goods/wardrobe', '模拟衣物 1', '编辑衣物模拟衣物 1'],
        ['member/index', '模拟订阅 1', /^编辑订阅：/],
        ['finance/cards', '模拟银行', '编辑'],
        ['finance/import', '选择账单文件', null],
        ['finance/index', '结余率', null],
        ['finance/income', '月均收入', '新增'],
        ['finance/expense', '月均支出', '新增'],
      ]) {
        await p.goto('/#/pages/' + route);
        await expect(
          p.getByText(ready, { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible();
        if (route === 'goods/devices') await expect(p.locator('.goods-photo')).toHaveCount(3);
        await p.screenshot({
          path: `${out}/${width}-${theme}-${route.replace('/', '-')}.png`,
          fullPage: true,
        });
        expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (edit) {
          if (route === 'finance/cards') {
            await p.getByRole('button', { name: /^编辑银行卡：/ }).first().click();
          } else await p.getByRole('button', { name: edit, exact: true }).first().click();
          await expect(p.getByRole('dialog')).toBeVisible();
          if (route === 'finance/cards') {
            await expect(p.getByRole('textbox', { name: '开户支行', exact: true })).toHaveCount(0);
            await p.getByRole('button', { name: '更多信息', exact: true }).click();
            await expect(p.getByRole('textbox', { name: '开户支行', exact: true })).toBeVisible();
          }
          await p.screenshot({
            path: `${out}/${width}-${theme}-${route.replace('/', '-')}-modal.png`,
            fullPage: true,
          });
          await p
            .getByRole('dialog')
            .evaluate((n) =>
              [n, ...n.querySelectorAll('*')]
                .filter(
                  (x) =>
                    x.scrollHeight > x.clientHeight + 5 &&
                    /auto|scroll/.test(getComputedStyle(x).overflowY),
                )
                .forEach((x) => (x.scrollTop = x.scrollHeight)),
            );
          await p.screenshot({
            path: `${out}/${width}-${theme}-${route.replace('/', '-')}-modal-bottom.png`,
            fullPage: true,
          });
          const size = await p.getByRole('dialog').boundingBox();
          expect(size.x).toBeGreaterThanOrEqual(0);
          expect(size.x + size.width).toBeLessThanOrEqual(width + 1);
          await p
            .getByRole('dialog')
            .evaluate((n) =>
              [n, ...n.querySelectorAll('*')]
                .filter(
                  (x) =>
                    x.scrollHeight > x.clientHeight + 5 &&
                    /auto|scroll/.test(getComputedStyle(x).overflowY),
                )
                .forEach((x) => (x.scrollTop = 0)),
            );
          await p.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
        } else if (route === 'finance/import') {
          await expect(
            p.getByRole('textbox', { name: '支付宝 CSV 内容', exact: true }),
          ).toHaveCount(0);
          await p.getByRole('button', { name: '粘贴 CSV 内容', exact: true }).click();
          await expect(
            p.getByRole('textbox', { name: '支付宝 CSV 内容', exact: true }),
          ).toBeVisible();
        }
      }
    });
