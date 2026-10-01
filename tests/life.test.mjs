import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
const source = await readFile(
  new URL("../src/services/life-catalog.ts", import.meta.url),
  "utf8",
);
const {
  buildCatalog,
  catalogSections,
  nativeDestination,
  readQuickLinks,
  visibleQuickLinks,
  quickLinkPayload,
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const item = (menuId, path, title = path) => ({ menuId, path, title });
const menu = (id, title, children = []) => ({ id, title, children });
test("按菜单树授权、隐藏父级、过滤危险路径，ID 不转数字", () => {
  const entries = [item("9223372036854775807", "/record/read", "阅读"),
    item("hidden", "/record/memo"), item("admin", "/system/menu"),
    item("bad", "//evil.test"), item("orphan", "/record/think"),
    item("home", "/analytics"), item("workspace", "/workspace"), item("about", "/vben-admin/about")];
  const prefs = { menus: [menu("parent", "隐藏目录", [menu("hidden", "笔记")]),
    menu("9223372036854775807", "阅读"), menu("admin", "权限菜单"), menu("bad", "危险地址"),
    menu("home", "主页"), menu("workspace", "工作台"), menu("about", "关于")], hiddenMenuIds: ["parent"] };
  assert.deepEqual(buildCatalog(entries, prefs).map((i) => i.menuId), ["9223372036854775807", "admin"]);
  assert.throws(() => buildCatalog([item(9223372036854775807, "/record/read")], prefs));
  assert.throws(() => buildCatalog(null, prefs));
  assert.throws(() => buildCatalog([], { menus: [menu(123, "错误")], hiddenMenuIds: [] }));
  assert.deepEqual(buildCatalog(entries, { menus: [], hiddenMenuIds: [] }), []);
});
test("分组、重名组、嵌套、顺序和名称来自配置，搜索直达且无重复入口", () => {
  const entries = [item("1", "/finance/expense", "旧名称"), item("2", "/finance/bank-cards", "银行卡"),
    item("3", "/coding/github", "GitHub"), item("4", "/record/read", "阅读")];
  const prefs = { menus: [menu("root", "自定义生活", [menu("3", "GitHub"),
    menu("nested", "我的账本", [menu("deep", "收支", [menu("1", "日常支出")]), menu("2", "银行卡")])]),
    menu("other", "自定义生活", [menu("4", "阅读")])], hiddenMenuIds: [] };
  const catalog = buildCatalog(entries, prefs);
  assert.deepEqual(catalog.map((i) => i.menuId), ["3", "1", "2", "4"]);
  const sections = catalogSections(catalog);
  assert.deepEqual(sections.map((s) => [s.menuId, s.title]), [["root", "自定义生活"], ["other", "自定义生活"]]);
  assert.equal(sections[0].items[1].title, "我的账本");
  assert.equal(sections[0].items[1].children[0].children[0].title, "日常支出");
  assert.equal(sections[0].items[1].children[1].menuId, "2");
  assert.equal(catalogSections(catalog, " 支出 ")[0].items[0].menuId, "1");
  assert.equal(catalogSections(catalog, "GITHUB")[0].items[0].menuId, "3");
  assert.deepEqual(catalogSections(catalog, "我的账本")[0].items.map((i) => i.menuId), ["1", "2"]);
  assert.deepEqual(catalogSections(catalog, "不存在"), []);
  prefs.hiddenMenuIds = ["1", "2"];
  assert.deepEqual(catalogSections(buildCatalog(entries, prefs))[0].items.map((i) => i.menuId), ["3"]);
});
test("顶层叶子无额外组名，配置改变后同步名称和顺序", () => {
  const entries = [item("1", "/finance/expense", "支出"), item("2", "/coding/github", "GitHub")];
  const prefs = { menus: [menu("1", "支出"), menu("2", "GitHub")], hiddenMenuIds: [] };
  assert.equal(catalogSections(buildCatalog(entries, prefs))[0].title, "");
  prefs.menus = [menu("new", "用户配置的新分组", [menu("2", "GitHub"), menu("1", "支出")])];
  const sections = catalogSections(buildCatalog(entries, prefs));
  assert.equal(sections[0].title, "用户配置的新分组");
  assert.deepEqual(sections[0].items.map((i) => i.menuId), ["2", "1"]);
});
test("首页和关于使用自定义路径或嵌套分组时仍排除，不误伤名称包含首页的业务", () => {
  const entries = [item("home", "/custom-home", "旧名称"),
    item("main", "/", "旧名称"), item("about", "/custom-about", "旧名称"),
    item("business", "/record/home-notes", "首页设计笔记")];
  const prefs = { menus: [menu("home", "首页"), menu("group", "导航", [
    menu("main", "主页"), menu("about", "关于")]), menu("business", "首页设计笔记")], hiddenMenuIds: [] };
  const catalog = buildCatalog(entries, prefs);
  assert.deepEqual(catalog.map((entry) => entry.menuId), ["business"]);
  assert.deepEqual(catalogSections(catalog).map((section) => section.title), [""]);
});
test("常用项显示授权启用项，保存保留停用和目录外配置、顺序及长 ID", () => {
  const saved = readQuickLinks([
    { menuId: "9223372036854775807", enabled: 0, sortOrder: 4 },
    { menuId: "a", enabled: 1, sortOrder: 1 },
    { menuId: "revoked", enabled: 1, sortOrder: 2 },
  ]);
  assert.deepEqual(
    visibleQuickLinks(saved, [item("a", "/record/read")]).map((i) => i.menuId),
    ["a"],
  );
  assert.deepEqual(quickLinkPayload(saved), [
    { menuId: "a", enabled: 1, sortOrder: 0 },
    { menuId: "revoked", enabled: 1, sortOrder: 1 },
    { menuId: "9223372036854775807", enabled: 0, sortOrder: 2 },
  ]);
  assert.throws(() =>
    quickLinkPayload(
      Array.from({ length: 13 }, (_, i) => ({ menuId: String(i), enabled: 1 })),
    ),
  );
  assert.throws(() => quickLinkPayload([{ menuId: "1" }, { menuId: "1" }]));
  assert.deepEqual(quickLinkPayload([]), []);
  assert.equal(nativeDestination("/time/time-tracker"), "/pages/time/index");
  assert.equal(nativeDestination("/finance/expense"), "/pages/finance/expense");
});
