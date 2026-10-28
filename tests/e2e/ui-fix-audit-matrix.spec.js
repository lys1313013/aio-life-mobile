const { test, expect } = require('./support/test');
const fs = require('node:fs');
const path = require('node:path');
const { setup: recordsSetup } = require('./qa-records-fixtures');
const { start: domainStart } = require('./qa-domains-ui');
const { setup: platformSetup, admin } = require('./qa-platform-fixtures');
const { setupMapFixture } = require('./footprint-map-fixture.cjs');
const { dashboardFixture } = require('./fixtures');
async function dismissModal(page) {
  const dialog = page.locator('[role=dialog]').last();
  const label = await dialog.getAttribute('aria-label');
  const count = await page.locator('[role=dialog]').evaluateAll((nodes, name) => nodes.filter(node => node.getAttribute('aria-label') === name).length, label);
  const cancel = dialog.locator('[role=button][aria-label=\"取消\"], button[aria-label=\"取消\"]');
  if ((await dialog.getAttribute('class') || '').includes('confirm-panel')) await cancel.last().click();
  else await page.locator('.modal-mask').last().click({ position: { x: 2, y: 2 } });
  await expect.poll(() => page.locator('[role=dialog]').evaluateAll((nodes, name) => nodes.filter(node => node.getAttribute('aria-label') === name).length, label)).toBe(count - 1);
}

// Independent evidence survives Playwright clearing test-results. Mock data only;
// screenshots still require human inspection before claiming visual acceptance.
const output = path.resolve('artifacts/ui-fixes-2026-10-25/screenshots');
const records = [
  ['todo', '/task/todo', '待办', 'tasks/todo'],
  ['think', '/record/think', '闪念', 'records/notes?kind=think'],
  ['memo', '/record/memo', '笔记', 'records/notes?kind=memo'],
  ['anniversary', '/record/anniversary', '纪念日', 'records/anniversary'],
  ['milestones', '/record/milestone', '里程碑', 'records/milestones'],
  ['honor', '/record/honor', '荣誉', 'records/honor'],
  ['feedback', '/record/feedback', '反馈', 'records/feedback'],
  ['movie', '/record/movie', '观影', 'records/library?kind=movie'],
  ['read', '/record/read', '阅读', 'records/library?kind=read'],
  ['exercise', '/record/exercise', '运动', 'records/exercise'],
  ['activity', '/record/performance', '活动', 'records/activity'],
  ['video', '/record/videoWatch', '视频', 'records/video'],
  ['weread', '/record/weread', '微信读书', 'records/weread'],
  ['devices', '/record/device', '设备', 'goods/devices'],
  ['wardrobe', '/wardrobe', '衣柜', 'goods/wardrobe'],
  ['member', '/membership', '会员', 'member/index'],
];
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  fs.mkdirSync(output, { recursive: true });
  const prefix = info.title.replace(/[^a-zA-Z0-9_-]/g, '-');
  await page.screenshot({ path: path.join(output, prefix + '-failure.png'), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(output, prefix + '-failure.json'), JSON.stringify({ test: info.title, status: info.status, errors: info.errors.map(error => error.message) }, null, 2));
});

const domains = ['finance/index', 'finance/income', 'finance/expense', 'finance/import', 'finance/cards', 'messages/index', 'mcp/index', 'vault/index'];

async function configure(page, width, theme) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
  await page.addInitScript(value => {
    localStorage.setItem('aio-life-mobile.theme.v1', value);
    localStorage.removeItem('aio-life-mobile.access-token.v1');
  }, theme);
}

function evidence(page, info) {
  const errors = [], layers = [], gaps = [];
  page.on('pageerror', error => errors.push(error.message));
  const prefix = info.title.replace(/[^a-zA-Z0-9_-]/g, '-');
  fs.mkdirSync(output, { recursive: true });
  async function shot(layer) {
    await expect(page.locator('.mobile-button-busy')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const file = path.join(output, `${prefix}-${layers.length}-${layer.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, '-')}.png`);
    await page.screenshot({ path: file, fullPage: true });
    layers.push({ layer, file });
  }
  async function panel(layer) {
    const dialog = page.locator('[role=dialog]').last();
    await expect(dialog).toBeVisible();
    await expect.poll(async () => {
      const box = await dialog.boundingBox(), size = page.viewportSize();
      return !!box && box.x >= -1 && box.y >= -1 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1;
    }).toBe(true);
    const footer = dialog.locator('.modal-footer');
    const actions = dialog.locator('.form-actions-primary [role=button], .form-actions-primary uni-button, .form-actions-primary button');
    let before = null;
    for (const button of await actions.all()) await expect(button).toBeInViewport();
    // Test actual foreground/background pairs; especially native inputs when the
    // application's saved theme deliberately disagrees with the OS theme.
    const colors = await dialog.locator('input, textarea, .form-field-label, .modal-title').evaluateAll(nodes => {
      const rgba = value => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((v, c, i) => v + c * [.2126, .7152, .0722][i], 0);
      return nodes.filter(node => {
        const box = node.getBoundingClientRect(), style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && !node.disabled && (node.value || node.textContent.trim());
      }).map(node => {
        let bg = [255, 255, 255], ancestors = [], current = node;
        while (current) { ancestors.unshift(current); current = current.parentElement; }
        for (const ancestor of ancestors) {
          const color = rgba(getComputedStyle(ancestor).backgroundColor), alpha = color[3] ?? 1;
          if (color.length >= 3) bg = bg.map((v, i) => color[i] * alpha + v * (1 - alpha));
          // AdaptiveModal paints its glass surface as an absolute sibling.
          const surface = Array.from(ancestor.children).find(child => child.classList.contains('modal-surface'));
          if (surface) { const paint = rgba(getComputedStyle(surface).backgroundColor), opacity = paint[3] ?? 1; if (paint.length >= 3) bg = bg.map((v, i) => paint[i] * opacity + v * (1 - opacity)); }
        }
        const fg = rgba(getComputedStyle(node).color), alpha = fg[3] ?? 1;
        const composed = bg.map((v, i) => fg[i] * alpha + v * (1 - alpha));
        const a = luminance(composed), b = luminance(bg);
        return { label: node.getAttribute('aria-label') || node.textContent.trim().slice(0, 35), color: getComputedStyle(node).color, background: bg, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
      });
    });
    expect(colors.filter(sample => sample.contrast < 3), JSON.stringify(colors)).toEqual([]);
    await shot(layer + '-top');
    if (await footer.count()) {
      let previousY = null, stableSamples = 0;
      await expect.poll(async () => {
        const box = await footer.boundingBox();
        stableSamples = previousY !== null && Math.abs(box.y - previousY) <= .1 ? stableSamples + 1 : 0;
        previousY = box.y; before = box;
        return stableSamples;
      }, { intervals: [100, 100, 100] }).toBeGreaterThanOrEqual(3);
    }
    await dialog.locator('.uni-scroll-view').evaluateAll(nodes => nodes.forEach(node => { node.scrollTop = node.scrollHeight; }));
    if (before) {
      for (const button of await actions.all()) await expect(button).toBeInViewport();
      const after = await footer.boundingBox();
      expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(1);
    }
    await shot(layer + '-bottom');
    layers.at(-1).colors = colors;
  }
  async function finish() {
    expect(errors).toEqual([]);
    const report = { test: info.title, layers, gaps, pageerrors: errors, status: info.status, manualVisualReview: 'required' };
    fs.writeFileSync(path.join(output, prefix + '.json'), JSON.stringify(report, null, 2));
    for (const gap of gaps) info.annotations.push({ type: 'coverage-gap', description: gap });
  }
  return { shot, panel, finish, gaps };
}

async function dismissAll(page) {
  for (let count = 0; count < 5 && await page.locator('[role=dialog]').count(); count++) await dismissModal(page);
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await expect(page.locator('.modal-mask')).toHaveCount(0);
}

// Snapshot accessible action labels rather than asserting fixture titles or the
// previous visual hierarchy. Only opening/cancelling is allowed here.
async function safeEditors(page, audit) {
  const scope = await page.locator('[role=dialog]').count() ? page.locator('[role=dialog]').last() : page;
  const labels = await scope.locator('[role=button], uni-button, button').evaluateAll(nodes => [...new Set(nodes.map(node => node.getAttribute('aria-label') || node.textContent.trim()).filter(label => /^(新增|编辑|提交反馈|反馈详情|任务详情|历史详情)/.test(label) && !/编辑模式|编辑资料|编辑快捷/.test(label)))]);
  let opened = 0;
  for (const label of labels) {
    const button = scope.getByRole('button', { name: label, exact: true }).first();
    if (!await button.isVisible() || !await button.isEnabled()) continue;
    await button.click();
    await page.waitForLoadState('networkidle');
    const openedDialog = await page.locator('[role=dialog]').last().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
    if (openedDialog) {
      await audit.panel(label);
      await dismissAll(page);
      opened++;
    } else audit.gaps.push(`入口 ${label} 未产生弹窗（可能改为页面或行内操作），需人工查看`);
  }
  if (!opened) audit.gaps.push('当前页面没有可打开的新增/详情/编辑弹窗；本用例只覆盖页面');
}

async function openRecords(page, item) {
  const state = await recordsSetup(page, test.info().project.use.baseURL);
  const entries = records.map(([menuId, path, title]) => ({ menuId, path, title }));
  await page.route('**/api/quick-nav/candidates?client=mobile', route => route.fulfill({ json: { code: 0, data: entries } }));
  await page.route('**/api/menu/preferences?client=mobile', route => route.fulfill({ json: { code: 0, data: { menus: entries.map(entry => ({ id: entry.menuId, title: entry.title, children: [] })), hiddenMenuIds: [] } } }));
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await page.getByRole('button', { name: item[2], exact: true }).click();
  await expect(page).toHaveURL(new RegExp(item[3].split('?')[0]));
  await page.waitForLoadState('networkidle');
  return state;
}

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  for (const item of records) test(`ui-fix records ${item[0]} ${width} ${theme}`, async ({ page }, info) => {
    test.setTimeout(90000);
    await configure(page, width, theme);
    const audit = evidence(page, info);
    await openRecords(page, item);
    await audit.shot('page');
    await safeEditors(page, audit);
    if (item[0] === 'anniversary') {
      await page.getByRole('button', { name: /^更多操作：/ }).first().click();
      await audit.shot('row-menu');
      await page.getByRole('button', { name: '编辑纪念日', exact: true }).click();
      await audit.panel('edit'); await dismissAll(page);
    }
    if (item[0] === 'todo') {
      await page.getByRole('button', { name: '管理任务列', exact: true }).click();
      await audit.panel('columns');
      await page.getByRole('button', { name: '编辑任务列', exact: true }).first().click();
      await audit.panel('column-editor'); await dismissAll(page);
    }
    if (item[0] === 'weread') {
      await page.getByRole('button', { name: '我的书架', exact: true }).click();
      await audit.shot('shelf');
      await page.getByRole('button', { name: /^书籍详情：/ }).first().click();
      await audit.panel('book-detail'); await dismissAll(page);
    }
    if (item[0] === 'wardrobe') {
      await page.getByRole('button', { name: '分类', exact: true }).click();
      await audit.shot('wardrobe-categories'); await safeEditors(page, audit);
    }
    await audit.finish();
  });

  for (const route of domains) test(`ui-fix domains ${route.replaceAll('/', '-')} ${width} ${theme}`, async ({ page }, info) => {
    test.setTimeout(90000);
    await configure(page, width, theme);
    const audit = evidence(page, info);
    await domainStart(page, route, { existingVault: route === 'vault/index' });
    await audit.shot('page');
    if (route === 'vault/index') {
      await page.getByRole('button', { name: '解锁', exact: true }).click();
      await audit.panel('mock-vault-unlock');
      await page.locator('[role=dialog]').locator('[aria-label="主密码"] input').fill('qa-master');
      await page.locator('[role=dialog]').getByRole('button', { name: '解锁', exact: true }).click();
      await expect(page.locator('[role=dialog]')).toHaveCount(0);
      await audit.shot('mock-vault-records');
    }
    if (route === 'finance/import') {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '选择文件', exact: true }).click();
      await (await chooser).setFiles(path.resolve('tests/e2e/qa-domains-fixtures/alipay.csv'));
      await expect(page.getByRole('button', { name: '编辑', exact: true }).first()).toBeVisible();
      await audit.shot('local-fixture-preview');
    }
    await safeEditors(page, audit);
    if (route === 'finance/cards') {
      await page.getByRole('button', { name: '银行卡更多操作', exact: true }).first().click();
      await audit.shot('card-menu');
      await page.getByRole('menuitem', { name: '编辑银行卡', exact: true }).click();
      await audit.panel('card-editor'); await dismissAll(page);
      await page.getByRole('button', { name: '管理标签', exact: true }).click();
      await audit.panel('tags'); await dismissAll(page);
    }
    if (route === 'messages/index') {
      await page.getByRole('button', { name: '发送消息', exact: true }).click();
      await audit.panel('compose'); await dismissAll(page);
      await page.locator('.conversation').first().click();
      await expect(page.locator('.chat-input')).toBeVisible(); await audit.shot('conversation');
    }
    if (route === 'mcp/index') {
      await page.getByRole('button', { name: /^输入参数并调用 / }).first().click();
      await audit.panel('tool-parameters'); await dismissAll(page);
    }
    await audit.finish();
  });

  for (const [kind, , title] of admin) test(`ui-fix admin ${kind} ${width} ${theme}`, async ({ page }, info) => {
    test.setTimeout(90000);
    await configure(page, width, theme);
    const audit = evidence(page, info);
    await platformSetup(page, true);
    await page.goto('/#/pages/admin/directory');
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await audit.shot('page');
    await safeEditors(page, audit);
    if (['dict-types', 'dict-data'].includes(kind)) {
      await page.getByRole('button', { name: /更多操作$/ }).first().click();
      await audit.shot('row-menu'); await safeEditors(page, audit);
    }
    if (kind === 'config') audit.gaps.push('qa-platform populated fixture 仅包含普通 JSON 配置；百度/腾讯/Typesafe/MBTI 结构化配置未提供专属 fixture，不把它们计作已验收');
    if (kind === 'feedback') {
      await page.getByRole('button', { name: '详情', exact: true }).first().click();
      await audit.panel('feedback-detail'); await dismissAll(page);
    }
    await audit.finish();
  });

  test(`ui-fix time-home ${width} ${theme}`, async ({ page }, info) => {
    await configure(page, width, theme);
    const audit = evidence(page, info);
    await platformSetup(page, true);
    await audit.shot('home');
    await page.getByRole('button', { name: '新增时迹', exact: true }).click();
    await audit.panel('home-time-editor'); await dismissAll(page);
    await page.locator('uni-tabbar').getByText('时迹', { exact: true }).click();
    await audit.shot('time');
    await page.getByRole('button', { name: '筛选分类', exact: true }).click();
    await audit.panel('time-filter'); await dismissAll(page);
    await page.getByRole('button', { name: '新增时迹', exact: true }).click();
    await audit.panel('time-editor'); await dismissAll(page);
    await audit.finish();
  });

  test(`ui-fix footprints ${width} ${theme}`, async ({ page }, info) => {
    await configure(page, width, theme);
    const audit = evidence(page, info);
    const state = await setupMapFixture(page);
    await page.route(`${info.project.use.baseURL}/api/**`, async route => {
      if (await state.handle(route)) return;
      const pathname = new URL(route.request().url()).pathname;
      let data = dashboardFixture(pathname);
      if (pathname === '/api/auth/login') data = { accessToken: 'synthetic-footprint-token' };
      if (pathname === '/api/user/info') data = { id: '7', nickname: '模拟用户', accountUsername: 'fixture' };
      if (pathname === '/api/quick-nav/candidates') data = [{ menuId: '1512', path: '/record/life-footprints', title: '生活足迹' }];
      if (pathname === '/api/menu/preferences') data = { menus: [{ id: '1512', title: '生活足迹', children: [] }], hiddenMenuIds: [] };
      return route.fulfill({ json: { code: 0, data: data ?? [] } });
    });
    await page.goto('/');
    await page.locator('[aria-label="账号"] input').fill('fixture');
    await page.locator('[aria-label="密码"] input').fill('fixture-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
    await page.getByRole('button', { name: '生活足迹', exact: true }).click();
    await expect(page.locator('.period-place').first()).toBeVisible();
    await audit.shot('map-periods');
    await page.getByRole('button', { name: '新增生活足迹', exact: true }).click();
    await audit.panel('create'); await dismissAll(page);
    await page.getByRole('button', { name: /^定位地点 / }).first().click();
    await audit.shot('place-detail');
    await page.getByRole('button', { name: '编辑生活足迹', exact: true }).click();
    await audit.panel('edit'); await dismissAll(page);
    expect(state.writes).toHaveLength(0);
    await audit.finish();
  });
}
