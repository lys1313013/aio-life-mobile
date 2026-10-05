const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { dashboardFixture } = require("./fixtures");

// Synthetic five-year data: bonuses, a negative month and long category names.
function statistics(expense) {
  return Array.from({ length: 63 }, (_, i) => ({
    year: 2021 + Math.floor((i + 6) / 12),
    month: ((i + 6) % 12) + 1,
    detail: expense
      ? [
          { typeName: "日常生活", amt: 3100.25 + i * 18 },
          { typeName: "住房", amt: 2200 },
          { typeName: "出行与公共交通", amt: 326.5 },
          { typeName: "数码设备", amt: i === 60 ? 20000 : 88 },
          { typeName: "学习", amt: 199 },
          { typeName: "其他", amt: 66 },
        ]
      : [
          { typeName: "工资", amt: 12500.5 + i * 100 },
          { typeName: "奖金", amt: i % 12 === 5 ? 25000 : 0 },
        ],
  }));
}
async function setup(page, theme, state = {}) {
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(() =>
    localStorage.setItem(
      "aio-life-mobile.access-token.v1",
      "finance-test-only",
    ),
  );
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data = dashboardFixture(p) ?? [];
    if (p === "/api/user/info")
      data = { id: "1", nickname: "模拟用户", roles: ["admin"] };
    if (p.endsWith("/statisticsByMonth")) {
      if (state.fail)
        return route.fulfill({ json: { rscode: "1", result: "模拟统计失败" } });
      data = state.empty ? [] : statistics(p.includes("/expense/"));
    }
    await route.fulfill({ json: { rscode: "0", data } });
  });
  await page.goto("/#/pages/finance/index");
}
async function selectYear(page, year) {
  await require("./qa-domains-ui").picker(page, "年份", year);
}
async function screenshot(page, name) {
  const dir = "/tmp/aio-finance-qa";
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name + ".png") });
}
for (const width of [390, 768, 1440])
  for (const theme of ["light", "dark"]) {
    test(`财务概览 ${width} ${theme}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 1000 });
      await setup(page, theme);
      const monthly = page.locator(".ledger").first();
      const trend = page.getByRole("figure", {
        name: "月度收支趋势",
        exact: true,
      });
      await expect(monthly.locator(".ledger-row")).toHaveCount(6);
      await expect(monthly.locator(".ledger-period").first()).toHaveText(
        "2026-09",
      );
      await expect(page.locator(".overview-tools")).toHaveCount(0);
      await expect(trend.locator("uni-picker")).toHaveCount(0);
      const cumulative = page.getByRole("figure", {
        name: "累计结余趋势",
        exact: true,
      });
      await expect(cumulative.locator("uni-picker")).toHaveCount(0);
      await expect(cumulative.locator(".chart-y-tick").first()).toBeVisible();
      await expect.poll(() => cumulative.locator(".aio-chart-canvas canvas").evaluate(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let colored = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 0 && Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 50) colored++;
        return colored;
      })).toBeGreaterThan(500);
      await expect(cumulative.locator(".mini-chart-values")).toHaveCount(0);
      await expect(cumulative.locator(".mini-chart-scale")).toHaveCount(0);
      await expect(cumulative.getByLabel("累计结余总金额")).toHaveText("676,041.25元");
      await expect(cumulative.locator(".chart-end-label")).toHaveCount(3);
      await expect(cumulative.locator(".mini-chart-header .chart-end-label")).toHaveCount(0);
      await screenshot(page, `${width}-${theme}-overview`);
      // Legend toggles stay identifiable and retain the series color.
      const expense = trend
        .locator(".chart-value-item")
        .filter({ hasText: "支出" });
      const color = await expense.evaluate((el) => getComputedStyle(el).color);
      await trend.getByRole("button", { name: "收入", exact: true }).click();
      await expect(trend.locator(".chart-value-item")).toHaveCount(2);
      expect(await expense.evaluate((el) => getComputedStyle(el).color)).toBe(
        color,
      );
      await trend.getByRole("button", { name: "收入", exact: true }).click();
      await monthly.scrollIntoViewIfNeeded();
      await monthly.getByRole("button", { name: "2026-09累计结余" }).click();
      await expect(monthly.locator(".ledger-detail")).toContainText(
        "676,041.25 元",
      );
      await screenshot(page, `${width}-${theme}-ledger`);
      await monthly.getByRole("button", { name: "更多月份" }).click();
      await expect(monthly.locator(".ledger-row")).toHaveCount(18);
      await monthly.getByRole("button", { name: "收起明细" }).click();
      await expect(monthly.locator(".ledger-row")).toHaveCount(6);
      const category = page.locator(".category-panel").last();
      // Both instances must paint independently; duplicate canvas IDs can hide one chart.
      for (const chart of await page.locator(".category-panel").all()) {
        await chart.scrollIntoViewIfNeeded();
        await expect.poll(() => chart.locator(".distribution-canvas canvas").evaluate((canvas) => {
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let painted = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
          return painted;
        })).toBeGreaterThan(500);
      }
      await expect(category.locator(".distribution-row")).toHaveCount(5);
      await category.getByRole("button", { name: "展开全部" }).click();
      await expect(category.locator(".distribution-row")).toHaveCount(6);
      await category.getByRole("button", { name: "收起", exact: true }).click();
      await category.scrollIntoViewIfNeeded();
      await screenshot(page, `${width}-${theme}-categories`);
      await selectYear(page, "2026");
      await expect(
        page.getByRole("figure", { name: "月度收支对比", exact: true }),
      ).toBeVisible();
      await expect(monthly.locator(".ledger-row")).toHaveCount(6);
      await expect(monthly.locator(".ledger-detail")).toHaveCount(0);
      await expect(page.locator(".summary-number").first()).toHaveText(
        "164,704.50",
      );
      await expect(page.getByRole("figure", { name: "收入构成", exact: true }).locator(".distribution-total")).toHaveText("164704.50");
      await monthly.getByRole("button", { name: "2026-09累计结余" }).click();
      await expect(monthly.locator(".ledger-detail")).toContainText(
        "81,578.75 元",
      );
      await page
        .locator(".comparison-tabs")
        .getByRole("button", { name: "结余率" })
        .click();
      await expect(
        page.getByRole("figure", { name: "月度结余率", exact: true }),
      ).toBeVisible();
      await screenshot(page, `${width}-${theme}-comparison`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Every ledger amount stays inside its column, even on phone widths.
      expect(
        await monthly
          .locator(".ledger-number")
          .evaluateAll((nodes) =>
            nodes.every((n) => n.scrollWidth <= n.clientWidth + 1),
          ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
test("统计失败重试和空态", async ({ page }) => {
  const state = { fail: true };
  await setup(page, "dark", state);
  await expect(page.getByText("模拟统计失败", { exact: true })).toBeVisible();
  state.fail = false;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(
    page.locator(".ledger").first().locator(".ledger-row"),
  ).toHaveCount(6);
  state.empty = true;
  await page.reload();
  await expect(page.getByText("暂无记录", { exact: true })).toBeVisible();
  await expect(page.locator(".ledger")).toHaveCount(0);
});
