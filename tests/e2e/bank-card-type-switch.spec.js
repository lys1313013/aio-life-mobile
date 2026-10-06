const { test, expect } = require('@playwright/test');

// 只模拟银行卡及登录所需接口，其他请求保留真实失败，避免掩盖依赖问题。
async function prepare(page, baseURL, cards) {
  await page.addInitScript(() => {
    localStorage.setItem('aio-life-mobile.access-token.v1', 'card-type-fixture');
    localStorage.setItem('bank-card-view-mode', 'stack');
  });
  for (const [path, data] of Object.entries({
    '/user/info': { id: '1', nickname: '模拟用户', roles: ['admin'] },
    '/auth/secondary-lock/menus': [],
    '/bank-cards': cards,
    '/bank-cards/banks': [{ id: '9', name: '模拟银行' }],
    '/bank-cards/tags': [],
  })) {
    await page.route(`${baseURL}/api${path}`, route => route.fulfill({ json: { code: 0, data } }));
  }
  await page.goto('/#/pages/finance/cards');
}

const card = { bankId: '9', bankName: '模拟银行', status: 'normal', tags: [], coverFileIds: [] };

test('切换类型取消旧卡号读取，旧响应不能覆盖新卡的加载或恢复明文', async ({ page, baseURL }) => {
  let releaseDebit, releaseCredit;
  const debitGate = new Promise(resolve => { releaseDebit = resolve; });
  const creditGate = new Promise(resolve => { releaseCredit = resolve; });
  await page.route(`${baseURL}/api/bank-cards/88/number`, async route => {
    await debitGate;
    await route.fulfill({ json: { code: 0, data: '622200001234' } });
  });
  await page.route(`${baseURL}/api/bank-cards/89/number`, async route => {
    await creditGate;
    await route.fulfill({ json: { code: 0, data: '433300005678' } });
  });
  await prepare(page, baseURL, [
    { ...card, id: '88', cardType: 'debit', cardNoLast4: '1234', sortOrder: 1 },
    { ...card, id: '89', cardType: 'credit', cardNoLast4: '5678', sortOrder: 2 },
  ]);
  await expect(page.locator('.card')).toHaveCount(1);
  const debit = page.getByRole('button', { name: '储蓄卡', exact: true });
  const credit = page.getByRole('button', { name: '信用卡', exact: true });
  await expect(debit).toHaveAttribute('aria-pressed', 'true');
  await expect(debit).toHaveText('储蓄卡 1');
  await expect(credit).toHaveText('信用卡 1');
  await expect(page.locator('.header-count, .face-type, .face-tail, .number')).toHaveCount(0);
  async function readNumber() {
    await page.locator('.card-face').click({ position: { x: 40, y: 24 } });
    await page.getByRole('button', { name: '银行卡更多操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '查看卡号', exact: true }).click();
  }
  const debitRequested = page.waitForRequest(`${baseURL}/api/bank-cards/88/number`);
  await readNumber();
  await debitRequested;
  await credit.click();
  await expect(page.locator('.card-stack-expanded')).toHaveCount(0);
  const creditRequested = page.waitForRequest(`${baseURL}/api/bank-cards/89/number`);
  await readNumber();
  await creditRequested;
  const oldResponse = page.waitForResponse(`${baseURL}/api/bank-cards/88/number`);
  releaseDebit();
  await oldResponse;
  await expect(page.getByRole('button', { name: '银行卡更多操作', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '银行卡卡号', exact: true })).toHaveCount(0);
  releaseCredit();
  const numberDialog = page.getByRole('dialog', { name: '银行卡卡号', exact: true });
  await expect(numberDialog.locator('.card-number-detail')).toHaveText('4333 0000 5678');
  await numberDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await debit.click();
  await expect(page.locator('.card-browser-moving')).toHaveCount(0);
  await page.locator('.card-face').click({ position: { x: 40, y: 24 } });
  await expect(numberDialog).toHaveCount(0);
  await expect(page.locator('.card').getByText(/6222|4333|1234|5678/)).toHaveCount(0);
});

test('只有信用卡时直接展示，空储蓄卡可切换且新增沿用当前类型', async ({ page, baseURL }) => {
  await prepare(page, baseURL, [{ ...card, id: '89', cardType: 'credit', cardNoLast4: '5678', sortOrder: 1 }]);
  await expect(page.getByRole('button', { name: '信用卡', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.card')).toHaveCount(1);
  await page.getByRole('button', { name: '储蓄卡', exact: true }).click();
  await expect(page.locator('.card')).toHaveCount(0);
  await expect(page.getByText('暂无储蓄卡', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新增银行卡', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '银行卡', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor.locator('[aria-label="类型"]')).toContainText('储蓄卡');
});
