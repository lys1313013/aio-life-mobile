const { dismissModal } = require('./modal');
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const out = "artifacts/menu-manager";
const longId = "9223372036854775807";
const item = (id, parentId, title, path, sort = 0, extra = {}) => ({
  id,
  parentId,
  name: "Route" + id,
  path,
  component: "BasicLayout",
  status: 1,
  sort,
  roles: "",
  meta: {
    title,
    icon: "lucide:home",
    keepAlive: true,
    extra: { retained: true },
  },
  ...extra,
});
async function setup(page, theme = "light") {
  page.on("pageerror", (error) =>
    console.log("MENU PAGE ERROR:", error.message),
  );
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("MENU CONSOLE:", msg.text());
  });
  page.on("requestfailed", (req) =>
    console.log("FAILED:", req.url(), req.failure()),
  );
  await page.addInitScript((theme) => {
    localStorage.setItem(
      "aio-life-mobile.access-token.v1",
      "synthetic-menu-token",
    );
    localStorage.setItem("aio-life-mobile.theme.v1", theme);
  }, theme);
  const state = {
    fail: false,
    failSort: false,
    treeFail: false,
    writes: [],
    rows: [
      item(longId, "0", "主页", "/", -1),
      item("2", "0", "仪表盘", "/dashboard", 0, { status: 0 }),
      item("21", "2", "人生仪表盘", "/dashboard/life"),
      item("3", "0", "时间和任务", "/tasks", 0),
      item("31", "3", "时迹", "/tasks/time"),
      item("32", "3", "待办", "/tasks/todo", 1),
      item("4", "0", "记录", "/record", 2),
      item(
        "41",
        "4",
        "阅读与长期个人学习记录",
        "/record/library/very-long-path-for-overflow-check",
      ),
      item("42", "4", "观影", "/record/video", 1),
      item("5", "0", "财务", "/finance", 3),
      item("51", "5", "账本", "/finance/ledger"),
      item("6", "0", "系统管理", "/system", 4),
      item("61", "6", "菜单管理", "/system/menu"),
      item("7", "0", "关于", "/about", 5),
    ],
  };
  await page.route("http://127.0.0.1:5180/api/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname.replace("/api", ""),
      method = req.method();
    let data = [];
    if (path === "/user/info")
      data = { id: "7", username: "fixture", roles: ["admin"] };
    else if (path === "/menu/admin/role-options") data = ["admin", "user"];
    else if (path === "/menu/admin/tree") {
      if (state.treeFail)
        return route.fulfill({ json: { code: 1, message: "模拟加载失败" } });
      const tree = (parent) =>
        state.rows
          .filter((row) => row.parentId === parent)
          .sort((a, b) => a.sort - b.sort)
          .map((row) => ({ ...row, children: tree(row.id) }));
      data = tree("0");
    } else if (method !== "GET") {
      const body = req.postDataJSON();
      state.writes.push({ path, method, body });
      if (state.fail || (state.failSort && path.endsWith("/sort")))
        return route.fulfill({ json: { code: 1, message: "模拟保存失败" } });
      const id = path.split("/")[3],
        row = state.rows.find((row) => row.id === id);
      if (method === "DELETE") {
        state.rows = state.rows.filter((row) => row.id !== id);
        data = true;
      } else if (method === "POST") {
        data = { ...body, id: "99" };
        state.rows.push(data);
      } else if (row) {
        Object.assign(row, body);
        data = row;
      }
    }
    return route.fulfill({ json: { code: 0, data } });
  });
  await page.goto("/#/pages/admin/index?kind=menus");
  await expect(
    page.getByRole("button", { name: "编辑主页", exact: true }),
  ).toBeVisible();
  return state;
}
for (const width of [320, 390, 768, 1440])
  for (const theme of ["light", "dark"]) {
    test(`菜单树布局及编辑 H5模拟 ${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await setup(page, theme);
      fs.mkdirSync(out, { recursive: true });
      await expect(page.locator(".menu-row")).toHaveCount(7);
      await page.getByRole("button", { name: "展开记录", exact: true }).click();
      await expect(page.locator(".menu-row")).toHaveCount(9);
      await page.screenshot({ path: `${out}/${width}-${theme}.png` });
      await page
        .getByRole("button", { name: "主页更多操作", exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "菜单详情" }),
      ).toBeVisible();
      await page.screenshot({ path: `${out}/${width}-${theme}-detail.png` });
      await page.getByRole("button", { name: "编辑菜单", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "菜单管理",
        exact: true,
      });
      await expect(
        dialog.getByRole("spinbutton", { name: "排序", exact: true }),
      ).toHaveValue("-1");
      await dialog
        .getByRole("button", { name: "高级设置", exact: true })
        .click();
      await expect(
        dialog.getByRole("textbox", { name: "其他菜单属性" }),
      ).toBeAttached();
      await page.screenshot({ path: `${out}/${width}-${theme}-editor.png` });
      await dialog
        .getByRole("textbox", { name: "其他菜单属性" })
        .fill('{"keepAlive":true}');
      await dialog.getByRole("button", { name: "收起高级设置" }).click();
      await dismissModal(page);
      await page.getByRole("button", { name: "调整顺序", exact: true }).click();
      await page.screenshot({ path: `${out}/${width}-${theme}-sort.png` });
      const areas = await page
        .locator(".menu-button")
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          })),
        );
      expect(areas.every((area) => area.width >= 44 && area.height >= 44)).toBe(
        true,
      );
      const overlap = await page.locator('.menu-row').evaluateAll(rows => rows.some(row => row.querySelector('.menu-title').getBoundingClientRect().right > row.querySelector('.menu-sort').getBoundingClientRect().left + 1));
      expect(overlap).toBe(false);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
test("菜单搜索、编辑失败恢复、父级新增、保护菜单、排序与删除 H5模拟", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const state = await setup(page);
  const search = page.getByRole("textbox", { name: "搜索菜单" });
  await search.fill(" LIBRARY ");
  await expect(page.locator(".menu-row")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "编辑记录", exact: true }),
  ).toBeVisible();
  await search.fill("不存在");
  await expect(page.getByText("没有匹配的菜单")).toBeVisible();
  await page.getByRole("button", { name: "清空搜索" }).click();
  await expect(page.locator(".menu-row")).toHaveCount(7);
  await page.getByRole("button", { name: "编辑主页", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "菜单管理", exact: true });
  await dialog
    .getByRole("textbox", { name: "菜单名称", exact: true })
    .fill("新主页");
  state.fail = true;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog.getByText("模拟保存失败")).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "菜单名称", exact: true }),
  ).toHaveValue("新主页");
  state.fail = false;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑新主页", exact: true }),
  ).toBeVisible();
  expect(state.writes.at(-1).path).toBe("/menu/admin/" + longId);
  expect(state.writes.at(-1).body).not.toHaveProperty("id");
  expect(state.writes.at(-1).body.meta.extra).toEqual({ retained: true });
  expect(state.writes.at(-1).body.sort).toBe(-1);
  await page.getByRole("button", { name: "仪表盘更多操作" }).click();
  await page.getByRole("button", { name: "启用菜单", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "停用菜单", exact: true }),
  ).toBeVisible();
  await dismissModal(page);
  await page.getByRole("button", { name: "系统管理更多操作" }).click();
  await expect(
    page.getByRole("button", { name: "停用菜单", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "删除菜单", exact: true }),
  ).toHaveCount(0);
  await dismissModal(page);
  await page.getByRole("button", { name: "记录更多操作" }).click();
  await page.getByRole("button", { name: "新增子菜单", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "菜单管理", exact: true });
  await dialog
    .getByRole("textbox", { name: "菜单名称", exact: true })
    .fill("新增记录");
  await dialog
    .getByRole("textbox", { name: "路由名称", exact: true })
    .fill("NewRecord");
  await dialog
    .getByRole("textbox", { name: "路由", exact: true })
    .fill("/record/new");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑新增记录", exact: true }),
  ).toBeVisible();
  expect(state.writes.at(-1).body.parentId).toBe("4");
  await page.getByRole("button", { name: "调整顺序", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "上移新主页", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "上移时间和任务", exact: true })
    .click();
  await expect(page.locator(".menu-title").nth(1)).toHaveText("时间和任务");
  state.failSort = true;
  await page.getByRole("button", { name: "上移仪表盘", exact: true }).click();
  await expect(
    page.getByText("部分顺序未保存，已重新加载，请重试"),
  ).toBeVisible();
  state.failSort = false;
  await page.getByRole("button", { name: "完成排序", exact: true }).click();
  await page.getByRole("button", { name: "新增记录更多操作" }).click();
  await page.getByRole("button", { name: "删除菜单", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "删除菜单", exact: true });
  await expect(confirm).toBeVisible();
  state.fail = true;
  await confirm.getByRole("button", { name: "确认", exact: true }).click();
  await expect(confirm.getByText("模拟保存失败")).toBeVisible();
  state.fail = false;
  await confirm.getByRole("button", { name: "确认", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑新增记录", exact: true }),
  ).toHaveCount(0);
});

test("菜单加载失败可重试，根菜单新增保留入口 H5模拟", async ({ page }) => {
  const state = await setup(page);
  state.treeFail = true;
  await page.reload();
  await expect(page.getByText("模拟加载失败")).toBeVisible();
  state.treeFail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑主页", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "全部展开", exact: true }).click();
  await expect(page.locator(".menu-row")).toHaveCount(14);
  await page.getByRole("button", { name: "全部折叠", exact: true }).click();
  await expect(page.locator(".menu-row")).toHaveCount(7);
  await page.getByRole("button", { name: "新增", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "菜单管理", exact: true });
  await dialog
    .getByRole("textbox", { name: "菜单名称", exact: true })
    .fill("新增根菜单");
  await dialog
    .getByRole("textbox", { name: "路由名称", exact: true })
    .fill("NewRoot");
  await dialog
    .getByRole("textbox", { name: "路由", exact: true })
    .fill("/new-root");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑新增根菜单", exact: true }),
  ).toBeVisible();
  expect(state.writes.at(-1).body.parentId).toBe("0");
});
