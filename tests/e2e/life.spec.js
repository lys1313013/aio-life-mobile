const { test, expect } = require('./support/test');
const { dashboardFixture } = require("./fixtures.js");
const { pullDown } = require("./gestures.js");
const entries = [
  ["9223372036854775807", "/time/time-tracker", "时迹", "mdi:clock-outline"],
  ["todo", "/task/todo", "待办", "mdi:format-list-checks"],
  ["goal", "/task/goal", "目标", "mdi:target"],
  ["read", "/record/read", "阅读记录", "lucide:book-open"],
  ["exercise", "/record/exercise", "运动", "mdi:run"],
  ["weread", "/record/weread", "微信读书", "svg:weread"],
  ["think", "/record/think", "闪念", "mdi:lightbulb-on-outline"],
  ["memo", "/record/memo", "笔记", "mdi:note-text-outline"],
  ["movie", "/record/movie", "观影", "mdi:movie-open-play-outline"],
  ["video", "/record/videoWatch", "视频观看", "mdi:video-vintage"],
  ["github", "/coding/github", "GitHub", "mdi:github"],
  ["leetcode", "/coding/leetcode", "LeetCode", "devicon:leetcode"],
  ["income", "/finance/income", "收入", "mdi:cash-plus"],
  ["expense", "/finance/expense", "支出", "mdi:cash-minus"],
  ["cards", "/finance/bank-cards", "银行卡", "lucide:credit-card"],
  ["membership", "/membership", "会员", "lucide:copyright"],
  ["wardrobe", "/wardrobe", "衣柜", "lucide:package"],
  ["device", "/my-hub/device", "设备墙", "lucide:monitor"],
  ["anniversary", "/record/anniversary", "纪念日", "mdi:calendar-heart"],
  ["relationship", "/relationship", "关系图谱", "lucide:users"],
  ["honor", "/my-hub/honor", "荣誉中心", "mdi:trophy-outline"],
  ["admin", "/system/menu", "权限菜单", "mdi:cog-outline"],
  ["hidden", "/record/private", "隐藏功能", "mdi:note-text-outline"],
  ["home", "/custom-home", "主页", "lucide:home"],
  ["about", "/vben-admin/about", "关于", "lucide:copyright"],
].map(([menuId, path, title, icon]) => ({ menuId, path, title, icon }));
const leaf = (id) => ({ id, title: entries.find((item) => item.menuId === id).title, children: [] });
const menuTree = [
  { id: "daily", title: "日常安排", children: ["9223372036854775807", "todo", "goal"].map(leaf) },
  { id: "records", title: "我的记录", children: ["read", "exercise", "weread", "think", "memo", "movie", "video"].map(leaf) },
  { id: "assets", title: "资产", children: [
    { id: "finance", title: "我的账本", children: [
      { id: "cash", title: "收支", children: [leaf("income"), leaf("expense")] }, leaf("cards"),
    ] }, ...["membership", "wardrobe", "device"].map(leaf),
  ] },
  { id: "coding", title: "开发记录", children: [leaf("github"), leaf("leetcode")] },
  ...["anniversary", "relationship", "honor", "admin", "hidden", "home", "about"].map(leaf),
];
async function setup(page, options = {}) {
  const state = {
    saved: options.saved || [],
    posts: [],
    catalogCalls: 0,
    quickCalls: 0,
  };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/quick-nav/candidates") state.catalogCalls++;
      if (path === "/api/quick-nav/my") state.quickCalls++;
      if (options.intercept && (await options.intercept(route, path, state)))
        return;
      let data = dashboardFixture(path);
      // 本用例只测试目录和快捷导航，避免首页业务卡片请求候选菜单干扰目录计数。
      if (path === '/api/home/cards') data = data.map(item => ({ ...item,
        isEnabled: Number(!['section.goal', 'section.anniversary', 'section.reading', 'section.membership', 'section.movie'].includes(item.cardKey)) }));
      if (path === "/api/auth/login") data = { accessToken: "life-fixture" };
      if (path === "/api/user/info")
        data = { id: "fixture-user", nickname: "目录测试用户" };
      if (path === "/api/quick-nav/candidates")
        data = options.empty ? [] : entries;
      if (path === "/api/menu/preferences")
        data = { menus: options.empty ? [] : menuTree, hiddenMenuIds: ["hidden"] };
      if (path === "/api/quick-nav/my") {
        if (route.request().method() === "POST") {
          const payload = route.request().postDataJSON();
          state.posts.push(payload);
          state.saved = payload.items.map((item) => ({
            ...entries.find((entry) => entry.menuId === item.menuId),
            ...item,
          }));
        }
        data = state.saved;
      }
      return route.fulfill({ json: { code: 0, data } });
    },
  );
  await page.goto("/");
  await page.locator('[aria-label="账号"] input').fill("fixture");
  await page.locator('[aria-label="密码"] input').fill("fixture-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("uni-tabbar").getByText("全部", { exact: true }).click();
  await expect(page).toHaveURL(/pages\/life\/index/);
  return state;
}
async function openEditor(page) {
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await page.getByRole("button", { name: "管理快捷导航", exact: true }).click();
  await expect(page).toHaveURL(/\/#\/$/);
  await expect(page.locator(".quick-editor")).toBeVisible();
}
async function addQuickChoice(page, title) {
  const picker = page.getByRole("dialog", { name: "添加快捷方式" });
  await picker.locator('[aria-label="搜索快捷方式"] input').fill(title);
  await picker.getByRole("button", { name: "添加" + title, exact: true }).click();
}
async function longPressDrag(page, source, target) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(), to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await expect(source.locator('..')).toHaveClass(/quick-editor-dragging/);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
}
for (const width of [390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`生活目录无重复常用区与首页原地编辑 ${width} ${colorScheme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await setup(page);
      await expect(
        page.getByRole("button", { name: "运动", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "权限菜单", exact: true }),
      ).toHaveCount(1);
      await expect(page.getByText("隐藏功能", { exact: true })).toHaveCount(0);
      await expect(page.locator("uni-tabbar .uni-tabbar__item")).toHaveCount(4);
      await expect(page.getByText("常用", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "编辑常用功能", exact: true })).toHaveCount(0);
      const tiles = page.locator(".life-section").first().locator(".life-tile");
      const tileBox = await tiles.first().boundingBox();
      expect(tileBox.width).toBeLessThanOrEqual(172);
      const iconBox = await tiles
        .first()
        .locator(".category-icon")
        .boundingBox();
      expect(
        Math.abs(iconBox.x + iconBox.width / 2 - tileBox.x - tileBox.width / 2),
      ).toBeLessThan(2);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("directory.png") });
      await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath("empty-home.png") });
      await openEditor(page);
      const editor = page.locator(".quick-editor");
      await expect(editor).toBeVisible();
      await editor.getByRole("button", { name: "添加快捷方式", exact: true }).click();
      await addQuickChoice(page, "运动");
      await page.getByRole("dialog", { name: "添加快捷方式" }).getByRole("button", { name: "完成添加", exact: true }).click();
      await expect(
        editor.getByRole("button", { name: "拖动排序运动", exact: true }),
      ).toBeVisible();
      const box = await editor.boundingBox();
      expect(box.width).toBeLessThanOrEqual(Math.min(width - 32, 960));
      await page.screenshot({ path: testInfo.outputPath("editor.png") });
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
      await expect(editor).toBeHidden();
      await expect(page.locator(".life-quick")).toHaveCount(0);
    });
  }
}
test("配置的菜单树支持嵌套返回、搜索直达与原生业务路由", async ({
  page,
  context,
}) => {
  await setup(page);
  await expect(page.locator(".life-tile").filter({ hasText: "主页" })).toHaveCount(0);
  await expect(page.locator(".life-tile").filter({ hasText: "关于" })).toHaveCount(0);
  await expect(page.locator(".life-section > .life-section-heading .life-title")).toHaveText(["日常安排", "我的记录", "资产", "开发记录"]);
  await expect(page.getByText("时间与任务", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "银行卡", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "我的账本功能组" }).click();
  await page.getByRole("button", { name: "收支功能组" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "收支", exact: true })
      .getByRole("button", { name: "支出" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "返回上级菜单" }).click();
  await expect(page.getByRole("dialog", { name: "我的账本", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "银行卡", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "关闭功能组" }).click();
  await page.locator('[aria-label="搜索功能"] input').fill("支出");
  await expect(
    page.getByRole("button", { name: "支出" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "支出", exact: true }).click();
  await expect(page).toHaveURL(/pages\/finance\/expense/);
  await page.goto('/#/pages/life/index');
  await page.locator('[aria-label="搜索功能"] input').fill("不存在");
  await expect(page.getByText("未找到相关功能")).toBeVisible();
  await page.getByRole("button", { name: "清空搜索" }).click();
  await page.getByRole("button", { name: "时迹", exact: true }).click();
  await expect(page).toHaveURL(/pages\/time\/index/);
  await page.locator("uni-tabbar").getByText("我", { exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await expect(page).toHaveURL(/pages\/about\/index/);
});
test("常用增删、排序、停用、保存失败恢复与首页同步", async ({ page }) => {
  let failSave = true;
  const state = await setup(page, {
    saved: [
      { ...entries.find((i) => i.menuId === "todo"), isEnabled: 1, sortOrder: 0 },
      { ...entries.find((i) => i.menuId === "goal"), isEnabled: 0, sortOrder: 1 },
    ],
    intercept: async (route, path) => {
      if (
        path === "/api/quick-nav/my" &&
        route.request().method() === "POST" &&
        failSave
      ) {
        failSave = false;
        await route.fulfill({
          json: { code: 123, message: "保存失败，请重试" },
        });
        return true;
      }
    },
  });
  await openEditor(page);
  const editor = page.locator(".quick-editor");
  await editor.getByRole("button", { name: "添加快捷方式", exact: true }).click();
  await addQuickChoice(page, "运动");
  await page.getByRole("dialog", { name: "添加快捷方式" }).getByRole("button", { name: "完成添加", exact: true }).click();
  const dragHandle = editor.getByRole("button", { name: "拖动排序运动", exact: true });
  const firstTile = editor.locator(".quick-editor-tile").first();
  await longPressDrag(page, dragHandle, firstTile);
  await expect(editor.locator(".quick-editor-title").first()).toHaveText("运动");
  await expect(editor.getByRole("button", { name: /^(上移|下移)/ })).toHaveCount(0);
  await page.waitForTimeout(460);
  await editor.getByRole("button", { name: "移除待办", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor.getByText("保存失败，请重试")).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "拖动排序运动", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(state.posts[0].items).toEqual([
    { menuId: "exercise", isEnabled: 1, sortOrder: 0 },
    { menuId: "goal", isEnabled: 0, sortOrder: 1 },
  ]);
  await expect(page.locator(".life-quick")).toHaveCount(0);
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await expect(
    page.locator(".quick-link").getByText("运动", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".quick-link").getByText("目标", { exact: true }),
  ).toHaveCount(0);
});
test("首页取消原地编辑后丢弃草稿", async ({ page }) => {
  const state = await setup(page, {
    saved: [{ ...entries.find((i) => i.menuId === "todo"), isEnabled: 1, sortOrder: 0 }],
  });
  await openEditor(page);
  await page.locator(".quick-editor").getByRole("button", { name: "移除待办", exact: true }).click();
  await page.getByRole("button", { name: "取消编辑", exact: true }).click();
  await expect(page.locator(".quick-link").getByText("待办", { exact: true })).toBeVisible();
  await openEditor(page);
  await expect(page.locator(".quick-editor").getByRole("button", { name: "拖动排序待办", exact: true })).toBeVisible();
  expect(state.posts).toHaveLength(0);
});
test("首页空态直接添加快捷方式并直达业务页", async ({ page }) => {
  const state = await setup(page);
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await page.getByRole("button", { name: "添加常用功能", exact: true }).click();
  const editor = page.locator(".quick-editor");
  await expect(page).toHaveURL(/\/#\/$/);
  await addQuickChoice(page, "待办");
  await page.getByRole("dialog", { name: "添加快捷方式" }).getByRole("button", { name: "完成添加", exact: true }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(state.posts[0].items).toEqual([{ menuId: "todo", isEnabled: 1, sortOrder: 0 }]);
  await page.locator(".quick-link").filter({ hasText: "待办" }).click();
  await expect(page).toHaveURL(/pages\/tasks\/todo/);
});
test("目录失败不显示伪造入口、可重试，下拉保留已有目录", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failRefresh = false;
  const state = await setup(page, {
    intercept: async (route, path, state) => {
      if (
        path === "/api/quick-nav/candidates" &&
        (state.catalogCalls <= 4 || failRefresh)
      ) {
        await route.fulfill({ status: 503, body: "unavailable" });
        return true;
      }
    },
  });
  await expect(
    page.getByRole("button", { name: "重试功能目录" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "编辑常用功能", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "重试功能目录" }).click();
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeVisible();
  failRefresh = true;
  await pullDown(page, ".tab-scroll");
  await expect(
    page.getByRole("button", { name: "重试功能目录" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeEnabled();
  expect(state.catalogCalls).toBeGreaterThan(2);
});
test("空目录不补默认项；未登录直接访问生活会跳转登录", async ({ page }) => {
  await page.goto("/#/pages/life/index");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await setup(page, { empty: true });
  await expect(page.getByText("暂无可用功能")).toBeVisible();
  await expect(page.locator(".life-tile")).toHaveCount(0);
});

for (const empty of [false, true]) {
  test(`生活目录短时间重新进入和整页刷新复用缓存，下拉强制更新，空目录=${empty}`, async ({ page }) => {
    const state = await setup(page, { empty });
    const content = empty
      ? page.getByText("暂无可用功能", { exact: true })
      : page.getByRole("button", { name: "运动", exact: true });
    await expect(content).toBeVisible();
    expect(state.catalogCalls).toBe(1);
    await page.goto('/#/pages/home/index');
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    const beforeReturn = state.catalogCalls;
    await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
    await expect(content).toBeVisible();
    await expect(page.locator('.life-page .content-skeleton')).toHaveCount(0);
    expect(state.catalogCalls).toBe(beforeReturn);
    const beforeReload = state.catalogCalls;
    await page.reload();
    await expect(content).toBeVisible();
    expect(state.catalogCalls).toBe(beforeReload);
    const beforeRefresh = state.catalogCalls;
    await pullDown(page, '.tab-scroll');
    await expect.poll(() => state.catalogCalls).toBeGreaterThan(beforeRefresh);
    await expect(content).toBeVisible();
  });
}

test("退出再登录清除目录缓存，即使服务端返回相同 Token", async ({ page }) => {
  const options = { empty: false };
  const state = await setup(page, options);
  await expect(page.getByRole('button', { name: '运动', exact: true })).toBeVisible();
  await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  options.empty = true;
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
  await expect(page.getByText('暂无可用功能', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '运动', exact: true })).toHaveCount(0);
  expect(state.catalogCalls).toBe(2);
});

test("目录 401 在请求层清理 Token 后仍返回登录页", async ({ page }) => {
  await setup(page, {
    intercept: async (route, path) => {
      if (path === "/api/quick-nav/candidates") {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await route.fulfill({ status: 401, body: "expired" });
        return true;
      }
    },
  });
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await expect(page.locator("uni-tabbar")).toBeHidden();
});
test("15 项上限不截断既有配置，停用项可重新添加、逐项移除可保存", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page, {
    saved: entries
      .slice(0, 15)
      .map((item, i) => ({ ...item, isEnabled: i === 1 ? 0 : 1, sortOrder: i })),
  });
  await openEditor(page);
  const editor = page.locator(".quick-editor");
  await expect(editor.locator(".quick-editor-tile")).toHaveCount(15);
  const lastTileBox = await editor.locator(".quick-editor-tile").last().boundingBox();
  const editorBox = await editor.boundingBox();
  expect(lastTileBox.y + lastTileBox.height).toBeLessThanOrEqual(editorBox.y + editorBox.height + 1);
  await page.screenshot({ path: testInfo.outputPath("editor-15.png"), fullPage: true });
  await expect(editor.getByRole("button", { name: "添加快捷方式", exact: true })).toHaveCount(0);
  await editor.getByRole("button", { name: "移除待办", exact: true }).click();
  await editor.getByRole("button", { name: "添加快捷方式", exact: true }).click();
  await addQuickChoice(page, "待办");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(state.posts[0].items).toHaveLength(15);
  expect(state.posts[0].items[0].menuId).toBe("9223372036854775807");
  expect(state.posts[0].items[14]).toMatchObject({ menuId: "todo", isEnabled: 1 });
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  const lastQuick = page
    .locator(".quick-link")
    .getByText("银行卡", { exact: true });
  await expect(async () => {
    await lastQuick.scrollIntoViewIfNeeded();
    await expect(lastQuick).toBeVisible();
  }).toPass({ timeout: 5000 });
  await page.locator("uni-tabbar").getByText("全部", { exact: true }).click();
  await openEditor(page);
  for (let i = 0; i < 15; i++) await editor.getByRole("button", { name: /^移除/ }).first().click();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toBeHidden();
  expect(state.posts[1].items).toEqual([]);
  await expect(page.locator(".life-quick")).toHaveCount(0);
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await expect(page.getByRole("button", { name: "添加常用功能", exact: true })).toBeVisible();
});
test("离页后的目录结果不能覆盖再次进入的新结果", async ({ page }) => {
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const state = await setup(page, {
    intercept: async (route, path, state) => {
      if (path === "/api/quick-nav/candidates" && state.catalogCalls === 1) {
        await waiting;
        await route.fulfill({
          json: {
            code: 0,
            data: [
              { menuId: "stale", title: "过期菜单", path: "/record/stale" },
            ],
          },
        });
        return true;
      }
    },
  });
  try {
  await expect.poll(() => state.catalogCalls).toBe(1);
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await expect(page.locator('.dashboard-scroll')).toBeVisible();
  await page.locator("uni-tabbar").getByText("全部", { exact: true }).click();
  await expect.poll(() => state.catalogCalls).toBe(2);
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/quick-nav/candidates"),
  );
  release();
  await response;
  await expect(page.getByText("过期菜单", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeVisible();
  } finally { release(); }
});

for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`目录过期后台更新不插入骨架、不禁用入口、不挤动布局 ${width} ${theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const start = new Date('2026-10-05T04:00:00Z');
    await page.clock.install({ time: start });
    let release, hold = false;
    const gate = new Promise(resolve => { release = resolve; });
    await setup(page, { intercept: async (route, path) => {
      if (hold && path === '/api/quick-nav/candidates') await gate;
      return false;
    } });
    const button = page.getByRole('button', { name: '运动', exact: true });
    await expect(button).toBeEnabled();
    const before = await button.boundingBox();
    await page.locator('uni-tabbar').getByText('我', { exact: true }).click();
    await expect(page).toHaveURL(/pages\/profile\/index/);
    hold = true;
    await page.clock.setFixedTime(new Date(start.getTime() + 61 * 60 * 1000));
    try {
      await page.locator('uni-tabbar').getByText('全部', { exact: true }).click();
      await expect(page.getByRole('status', { name: '正在更新功能目录' })).toBeVisible();
      await expect(page.locator('.life-page .content-skeleton')).toHaveCount(0);
      await expect(button).toBeEnabled();
      expect(await button.boundingBox()).toEqual(before);
      await page.screenshot({ path: info.outputPath('background.png'), fullPage: true });
      release();
      await expect(page.getByRole('status', { name: '正在更新功能目录' })).toHaveCount(0);
      expect(await button.boundingBox()).toEqual(before);
    } finally { release(); await page.unrouteAll({ behavior: 'ignoreErrors' }); }
  });
}

for (const width of [390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`快捷导航对齐Web网格与单项删除 ${width} ${colorScheme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await setup(page, { saved: entries.slice(0, 12).map((item, index) => ({
        ...item, title: index === 0 ? "很长的快捷导航名称" : item.title, isEnabled: 1, sortOrder: index,
      })) });
      await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
      const card = page.locator('[data-card-key="section.links"]');
      const before = await card.boundingBox();
      await openEditor(page);
      const editor = page.locator(".quick-editor");
      await expect(editor.locator(".quick-editor-tile")).toHaveCount(12);
      const after = await card.boundingBox();
      expect(after.width).toBeCloseTo(before.width, 0);
      const tiles = await editor.locator(".quick-editor-tile").evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
      }));
      expect(tiles.slice(0, 5).every(tile => Math.abs(tile.y - tiles[0].y) < 1)).toBe(true);
      expect(tiles[5].y).toBeGreaterThan(tiles[0].y);
      expect(tiles.every(tile => tile.width >= 44 && tile.height >= 44)).toBe(true);
      expect(after.height).toBeLessThan(320);
      await expect(editor.locator(".quick-editor-controls")).toHaveCount(0);
      await card.screenshot({ path: testInfo.outputPath("quick-editor.png") });
      await expect(editor.getByRole("button", { name: "移除待办", exact: true })).toBeVisible();
      await expect(editor.locator(".quick-editor-footer")).toHaveCount(0);
      expect((await card.boundingBox()).height).toBeCloseTo(after.height, 0);
      const removeButton = editor.getByRole("button", { name: "移除待办", exact: true });
      const removeBox = await removeButton.boundingBox();
      expect(removeBox.width).toBeGreaterThanOrEqual(44);
      expect(removeBox.height).toBeGreaterThanOrEqual(44);
      await expect(editor.getByRole("button", { name: /^(上移|下移)/ })).toHaveCount(0);
      await longPressDrag(page, editor.getByRole("button", { name: "拖动排序待办", exact: true }), editor.getByRole("button", { name: "拖动排序目标", exact: true }));
      await expect(editor.locator(".quick-editor-title").nth(2)).toHaveText("待办");

      await page.waitForTimeout(460);
      await editor.getByRole("button", { name: "移除待办", exact: true }).click();
      await expect(editor.locator(".quick-editor-tile")).toHaveCount(11);
      await expect(editor.locator(".quick-editor-dragging")).toHaveCount(0);
      await page.getByRole("button", { name: "取消编辑", exact: true }).click();
    });
  }
}

test('快捷导航触摸拖动、键盘排序与保存中锁定', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = await setup(page, {
    saved: entries.slice(0, 3).map((item, index) => ({ ...item, isEnabled: 1, sortOrder: index })),
    intercept: async (route, path) => {
      if (path === '/api/quick-nav/my' && route.request().method() === 'POST') await pending;
    },
  });
  await openEditor(page);
  const editor = page.locator('.quick-editor');
  const source = editor.getByRole('button', { name: '拖动排序目标', exact: true });
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await editor.getByRole('button', { name: '拖动排序时迹', exact: true }).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }] });
  await expect(source.locator('..')).toHaveClass(/quick-editor-dragging/);
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + from.width / 2 + (to.x - from.x) * i / 8, y: from.y + from.height / 2 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(editor.locator('.quick-editor-title').first()).toHaveText('目标');
  await expect(editor.locator('.quick-editor-controls')).toHaveCount(0);
  await page.waitForTimeout(460);
  await expect(editor.getByRole('button', { name: '移除目标', exact: true })).toBeVisible();
  await source.press('ArrowRight');
  await expect(editor.locator('.quick-editor-title').nth(1)).toHaveText('目标');
  const save = page.getByRole('button', { name: '保存', exact: true });
  await save.click();
  try {
    await expect(save).toHaveAttribute('aria-busy', 'true');
    await expect(source).toBeDisabled();
    await expect(editor.getByRole('button', { name: '移除目标', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(editor).toBeHidden();
  expect(state.posts[0].items.map(item => item.menuId)).toEqual(['9223372036854775807', 'goal', 'todo']);
});


test('进入快捷导航编辑不重复查询，候选加载失败不影响保存既有配置', async ({ page }) => {
  let blockReads = false;
  const state = await setup(page, {
    saved: entries.slice(0, 3).map((item, index) => ({ ...item, isEnabled: index === 1 ? 0 : 1, sortOrder: index })),
    intercept: async (route, path) => {
      if (blockReads && ['/api/quick-nav/my', '/api/quick-nav/candidates'].includes(path) && route.request().method() === 'GET') {
        await route.fulfill({ json: { code: 123, message: '模拟候选加载失败' } }); return true;
      }
    },
  });
  await page.locator('uni-tabbar').getByText('首页', { exact: true }).click();
  await expect(page.locator('.quick-link').getByText('目标', { exact: true })).toBeVisible();
  const reads = state.quickCalls, candidates = state.catalogCalls;
  blockReads = true;
  await openEditor(page);
  const editor = page.locator('.quick-editor');
  await expect(editor.locator('.quick-editor-tile')).toHaveCount(3);
  await expect(editor.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  expect(state.quickCalls).toBe(reads);
  expect(state.catalogCalls).toBe(candidates);
  await editor.getByRole('button', { name: '添加快捷方式', exact: true }).click();
  await expect(page.getByRole('button', { name: '重试加载功能' })).toBeVisible();
  await page.getByRole('dialog', { name: '添加快捷方式' }).getByRole('button', { name: '完成添加', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator('.quick-link').getByText('目标', { exact: true })).toBeVisible();
  expect(state.posts[0].items).toHaveLength(3);
  expect(state.posts[0].items[1].isEnabled).toBe(0);
  expect(state.quickCalls).toBe(reads + 1); // 仅保存 POST，成功后使用返回结果。
});

test('快捷导航短滑不排序，长按取消不提交，跨行拖动跟手让位', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await setup(page, { saved: entries.slice(0, 12).map((item, index) => ({ ...item, isEnabled: 1, sortOrder: index })) });
  await openEditor(page);
  const editor = page.locator('.quick-editor');
  const source = editor.getByRole('button', { name: '拖动排序时迹', exact: true });
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(), to = await editor.getByRole('button', { name: '拖动排序笔记', exact: true }).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const point = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const touch = (type, rect) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: rect ? [point(rect)] : [] });
  await touch('touchStart', from);
  await touch('touchMove', to);
  await touch('touchEnd');
  await expect(editor.locator('.quick-editor-title').first()).toHaveText('时迹');
  await source.scrollIntoViewIfNeeded();
  const current = await source.boundingBox(), destination = await editor.getByRole('button', { name: '拖动排序笔记', exact: true }).boundingBox();
  await touch('touchStart', current);
  await expect(source.locator('..')).toHaveClass(/quick-editor-dragging/);
  await touch('touchMove', destination);
  await expect(source.locator('..')).toHaveCSS('transform', /matrix\(/);
  await page.locator('[data-card-key="section.links"]').screenshot({ path: testInfo.outputPath('quick-dragging.png') });
  await touch('touchCancel');
  await expect(editor.locator('.quick-editor-title').first()).toHaveText('时迹');
  await expect(editor.locator('.quick-editor-dragging')).toHaveCount(0);
  await expect(source.locator('..')).toHaveCSS('transform', 'none');
  const again = await source.boundingBox(), last = await editor.getByRole('button', { name: '拖动排序笔记', exact: true }).boundingBox();
  await touch('touchStart', again);
  await expect(source.locator('..')).toHaveClass(/quick-editor-dragging/);
  await touch('touchMove', last);
  await touch('touchEnd');
  await expect(editor.locator('.quick-editor-title').nth(7)).toHaveText('时迹');
  await expect(editor.locator('.quick-editor-controls')).toHaveCount(0);
});

for (const width of [390, 768, 1440]) for (const colorScheme of ['light', 'dark']) {
  test(`快捷导航添加选择器分组层级、搜索与按钮间距 ${width} ${colorScheme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    const candidates = entries.slice(0, 15).map((item, index) => ({ ...item,
      parentTitle: index < 3 ? '任务与时间' : index < 10 ? '生活记录' : index < 12 ? '编程' : '财务',
      title: item.menuId === 'memo' ? '一条很长的笔记功能名称，检查换行后的图标对齐' : item.title,
    }));
    const state = await setup(page, { intercept: async (route, path) => {
      if (path !== '/api/quick-nav/candidates') return false;
      await route.fulfill({ json: { code: 0, data: candidates } });
      return true;
    } });
    await openEditor(page);
    await page.getByRole('button', { name: '添加快捷方式', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '添加快捷方式' });
    const group = picker.getByRole('button', { name: '任务与时间分组' });
    await expect(group).toHaveAttribute('aria-expanded', 'false');
    await expect(picker.getByRole('button', { name: '添加时迹', exact: true })).toHaveCount(0);
    await group.click();
    await expect(group).toHaveAttribute('aria-expanded', 'true');
    const add = picker.getByRole('button', { name: '添加时迹', exact: true });
    await expect(add).toBeVisible();
    const first = await add.boundingBox();
    const second = await picker.getByRole('button', { name: '添加待办', exact: true }).boundingBox();
    expect(first.width).toBeGreaterThanOrEqual(44);
    expect(first.height).toBeGreaterThanOrEqual(44);
    expect(second.y - first.y - first.height).toBeGreaterThanOrEqual(7);
    await expect(add).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    const heading = await group.boundingBox();
    const child = await picker.locator('.quick-picker-choice').first().boundingBox();
    expect(child.x - heading.x).toBeGreaterThanOrEqual(24);
    await picker.screenshot({ path: testInfo.outputPath('picker-grouped.png') });
    await group.click();
    await expect(add).toHaveCount(0);
    const search = picker.locator('[aria-label="搜索快捷方式"] input');
    await search.fill('生活记录');
    await expect(picker.locator('.quick-picker-group')).toHaveCount(1);
    await expect(picker.locator('.quick-picker-choice')).toHaveCount(7);
    await picker.screenshot({ path: testInfo.outputPath('picker-search.png') });
    await search.fill('不存在的菜单');
    await expect(picker.getByText('暂无可添加的功能')).toBeVisible();
    await search.fill('时迹');
    await add.click();
    await expect(add).toHaveCount(0);
    await picker.getByRole('button', { name: '完成添加', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.locator('.quick-editor')).toBeHidden();
    expect(state.posts[0].items).toEqual([{ menuId: '9223372036854775807', isEnabled: 1, sortOrder: 0 }]);
  });
}
