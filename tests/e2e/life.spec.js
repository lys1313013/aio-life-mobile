const { test, expect } = require("@playwright/test");
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
      return route.fulfill({ json: { rscode: "0", data } });
    },
  );
  await page.goto("/");
  await page.locator('[aria-label="账号"] input').fill("fixture");
  await page.locator('[aria-label="密码"] input').fill("fixture-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.locator("uni-tabbar").getByText("生活", { exact: true }).click();
  await expect(page).toHaveURL(/pages\/life\/index/);
  return state;
}
async function openEditor(page) {
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  await page.getByRole("button", { name: "管理快捷导航", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "编辑常用功能", exact: true })).toBeVisible();
}
for (const width of [390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"]) {
    test(`生活目录无重复常用区与首页编辑弹窗 ${width} ${colorScheme}`, async ({
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
      await openEditor(page);
      const dialog = page.getByRole("dialog", {
        name: "编辑常用功能",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "添加运动", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", { name: "移除运动", exact: true }),
      ).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box.width).toBeLessThanOrEqual(Math.min(width - 32, 560));
      expect(box.height).toBeLessThanOrEqual(900 - 48);
      await page.screenshot({ path: testInfo.outputPath("editor.png") });
      await dialog
        .getByRole("button", { name: "取消编辑", exact: true })
        .click();
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
  await page.locator("uni-tabbar").getByText("我的", { exact: true }).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  await expect(page).toHaveURL(/pages\/about\/index/);
});
test("常用增删、排序、停用、保存失败恢复与首页同步", async ({ page }) => {
  let failSave = true;
  const state = await setup(page, {
    saved: [
      { ...entries.find((i) => i.menuId === "todo"), enabled: 1, sortOrder: 0 },
      { ...entries.find((i) => i.menuId === "goal"), enabled: 0, sortOrder: 1 },
    ],
    intercept: async (route, path) => {
      if (
        path === "/api/quick-nav/my" &&
        route.request().method() === "POST" &&
        failSave
      ) {
        failSave = false;
        await route.fulfill({
          json: { rscode: "123", result: "保存失败，请重试" },
        });
        return true;
      }
    },
  });
  await openEditor(page);
  const dialog = page.getByRole("dialog", {
    name: "编辑常用功能",
    exact: true,
  });
  await dialog.getByRole("button", { name: "添加运动", exact: true }).click();
  await dialog.getByRole("button", { name: "上移运动", exact: true }).click();
  await dialog.getByRole("button", { name: "上移运动", exact: true }).click();
  await dialog.getByRole("button", { name: "移除待办", exact: true }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByText("保存失败，请重试")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "移除运动", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.posts[0].items).toEqual([
    { menuId: "exercise", enabled: 1, sortOrder: 0 },
    { menuId: "goal", enabled: 0, sortOrder: 1 },
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
test("目录失败不显示伪造入口、可重试，下拉保留已有目录", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failRefresh = false;
  const state = await setup(page, {
    intercept: async (route, path, state) => {
      if (
        path === "/api/quick-nav/candidates" &&
        (state.catalogCalls === 1 || failRefresh)
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
  ).toBeDisabled();
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
  test(`生活目录在页面重建后复用缓存，空目录=${empty}`, async ({ page }) => {
    const state = await setup(page, { empty });
    const content = empty
      ? page.getByText("暂无可用功能", { exact: true })
      : page.getByRole("button", { name: "运动", exact: true });
    await expect(content).toBeVisible();
    expect(state.catalogCalls).toBe(1);
    await page.evaluate(() => uni.reLaunch({ url: '/pages/home/index' }));
    await expect(page.locator('.dashboard-scroll')).toBeVisible();
    await page.locator('uni-tabbar').getByText('生活', { exact: true }).click();
    await expect(content).toBeVisible();
    await expect(page.locator('.life-page .content-skeleton')).toHaveCount(0);
    expect(state.catalogCalls).toBe(1);
    await pullDown(page, '.tab-scroll');
    await expect.poll(() => state.catalogCalls).toBe(2);
    await expect(content).toBeVisible();
  });
}

test("退出再登录清除目录缓存，即使服务端返回相同 Token", async ({ page }) => {
  const options = { empty: false };
  const state = await setup(page, options);
  await expect(page.getByRole('button', { name: '运动', exact: true })).toBeVisible();
  await page.locator('uni-tabbar').getByText('我的', { exact: true }).click();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible();
  options.empty = true;
  await page.locator('[aria-label="账号"] input').fill('fixture');
  await page.locator('[aria-label="密码"] input').fill('fixture-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.locator('uni-tabbar').getByText('生活', { exact: true }).click();
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
test("12 项上限不截断既有配置，停用可恢复、清空可保存", async ({ page }) => {
  const state = await setup(page, {
    saved: entries
      .slice(0, 12)
      .map((item, i) => ({ ...item, enabled: i === 1 ? 0 : 1, sortOrder: i })),
  });
  await openEditor(page);
  const dialog = page.getByRole("dialog", {
    name: "编辑常用功能",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "添加收入", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "启用待办", exact: true }).click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.posts[0].items).toHaveLength(12);
  expect(state.posts[0].items[0].menuId).toBe("9223372036854775807");
  expect(state.posts[0].items[1].enabled).toBe(1);
  await page.locator("uni-tabbar").getByText("首页", { exact: true }).click();
  const lastQuick = page
    .locator(".quick-link")
    .getByText("LeetCode", { exact: true });
  await expect(async () => {
    await lastQuick.scrollIntoViewIfNeeded();
    await expect(lastQuick).toBeVisible();
  }).toPass({ timeout: 5000 });
  await page.locator("uni-tabbar").getByText("生活", { exact: true }).click();
  await openEditor(page);
  for (const item of entries.slice(0, 12))
    await dialog
      .getByRole("button", { name: "移除" + item.title, exact: true })
      .click();
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
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
            rscode: "0",
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
  await page.locator("uni-tabbar").getByText("生活", { exact: true }).click();
  await expect.poll(() => state.catalogCalls).toBe(2);
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeVisible();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/quick-nav/candidates"),
  );
  release();
  await response;
  await expect(page.getByText("过期菜单", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "运动", exact: true }),
  ).toBeVisible();
  } finally { release(); }
});
