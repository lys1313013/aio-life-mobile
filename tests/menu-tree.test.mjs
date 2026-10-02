import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
const source = await readFile(
  new URL("../src/services/admin/menu-tree.ts", import.meta.url),
  "utf8",
);
const { visibleMenus, menuMoveChanges } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const rows = [
  { id: "1", parentId: "0", title: "记录", sort: -1 },
  {
    id: "9223372036854775807",
    parentId: "1",
    title: "阅读",
    name: "Reading",
    path: "/read",
    sort: 0,
  },
  { id: "3", parentId: "0", title: "设置", sort: 0 },
  { id: "4", parentId: "0", title: "其他", sort: 0 },
];
test("折叠和搜索保留祖先、忽略空格和大小写，清空后恢复折叠", () => {
  assert.deepEqual(
    visibleMenus(rows, []).map((row) => row.id),
    ["1", "3", "4"],
  );
  assert.equal(visibleMenus(rows, ["1"]).length, 4);
  assert.deepEqual(
    visibleMenus(rows, [], " READ ").map((row) => row.id),
    ["1", "9223372036854775807"],
  );
  assert.equal(visibleMenus(rows, [], "不存在").length, 0);
  assert.equal(visibleMenus(rows, [], " ").length, 3);
});
test("同级排序修复重复值，保留负数，边界和唯一子节点不可移动", () => {
  const changes = menuMoveChanges(rows, rows[3], -1);
  const sorts = new Map(changes.map((change) => [change.row.id, change.sort]));
  assert.deepEqual(
    rows
      .filter((row) => row.parentId === "0")
      .sort((a, b) => (sorts.get(a.id) ?? a.sort) - (sorts.get(b.id) ?? b.sort))
      .map((row) => row.id),
    ["1", "4", "3"],
  );
  assert.deepEqual(menuMoveChanges(rows, rows[0], -1), []);
  assert.deepEqual(menuMoveChanges(rows, rows[1], 1), []);
});
