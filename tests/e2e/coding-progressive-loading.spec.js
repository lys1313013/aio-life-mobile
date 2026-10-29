const { test, expect } = require('./support/test');
const { pullDown } = require('./gestures');

function gate() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}
const position = region => region.evaluate(element => {
  const box = element.getBoundingClientRect();
  const container = element.closest('.mobile-page-content').getBoundingClientRect();
  return { height: box.height, top: box.top - container.top };
});
const ok = data => ({ json: { code: 0, message: null, data } });
async function setup(page, apiMock, name) {
  const state = { hold: gate(), user: gate(), fail: false, calls: {} };
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'fixture-coding-progressive'));
  const data = name === 'csdn' ? {
    stats: { viewCount: 231819, originalCount: 81, rank: 13599, fansCount: 3905, likeCount: 864, commentCount: 32 },
    articles: [],
  } : {
    profile: { userProfilePublicProfile: { siteRanking: 13599, profile: { reputation: 30 } }, userProfileUserQuestionProgress: { numAcceptedQuestions: [{ difficulty: 'EASY', count: 314 }], numFailedQuestions: [], numUntouchedQuestions: [{ difficulty: 'EASY', count: 774 }] } },
    contest: { userContestRanking: { rating: 1515, globalRanking: 356366, globalTotalParticipants: 896895, localRanking: 72004, localTotalParticipants: 155394 } },
    calendar: { userCalendar: { submissionCalendar: '{}', recentStreak: 0, totalActiveDays: 0 } },
    daily: { todayRecord: [{ date: '2026-10-29', userStatus: 'NOT_START', question: { translatedTitle: '模拟每日题目', titleSlug: 'fixture' } }] },
    recent: { recentACSubmissions: [] },
  };
  const slow = name === 'csdn' ? 'articles' : 'recent';
  const handlers = {
    'GET /api/user/info': async () => { await state.user.promise; return ok({ id: '1', nickname: '模拟用户', roles: [] }); },
    'GET /api/auth/secondary-lock/menus': ok([]),
    'GET /api/menu/visuals': ok({ menus: [], cards: {} }),
    'GET /api/userbinds/list': request => {
      expect(new URL(request.url()).searchParams.get('includeToken')).toBe('false');
      state.calls.bindings = (state.calls.bindings || 0) + 1;
      return ok([{ platform: name, platformUsername: 'fixture-coding' }]);
    },
  };
  for (const [key, value] of Object.entries(data)) handlers[`GET /api/${name}/${name === 'leetcode' ? 'data/' : ''}${key}`] = async request => {
    if (name === 'csdn') expect(new URL(request.url()).searchParams.get('username')).toBe('fixture-coding');
    state.calls[key] = (state.calls[key] || 0) + 1;
    if (key === 'calendar') await state.hold.promise;
    if (key === slow) { await state.hold.promise; if (state.fail) return { json: { code: 1, message: '模拟区域失败' } }; }
    return ok(value);
  };
  apiMock(handlers);
  return { state, slow };
}

for (const name of ['csdn', 'leetcode']) for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`${name} progressive loading keeps completed empty region through refresh and retry ${width} ${theme}`, async ({ page, apiMock }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ colorScheme: theme });
    const { state, slow } = await setup(page, apiMock, name);
    const region = page.locator(name === 'csdn' ? '.coding-articles' : '.coding-recent');
    const empty = name === 'csdn' ? '暂无近期文章' : '暂无通过记录';
    try {
      await page.goto('/#/pages/coding/' + name);
      // 用户资料尚未返回时即使用各区域同形占位，不先闪通用列表骨架。
      await expect(region.locator('.content-skeleton').first()).toBeVisible();
      if (name === 'leetcode') await expect(page.locator('.coding-calendar .heatmap')).toHaveAttribute('aria-busy', 'true');
      expect(state.calls.bindings || 0).toBe(0);
      await page.screenshot({ path: info.outputPath('initializing.png'), fullPage: true });
      state.user.release();
      await expect(page.getByText(name === 'csdn' ? '231,819' : '314', { exact: true })).toBeVisible();
      await expect(region.locator('.content-skeleton').first()).toBeVisible();
      await page.screenshot({ path: info.outputPath('partial.png'), fullPage: true });
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('partial-region.png') });
      const calendar = page.locator('.coding-calendar');
      const calendarBefore = name === 'leetcode' ? await position(calendar) : null;
      state.hold.release();
      await expect(region.getByText(empty, { exact: true })).toBeVisible();
      if (name === 'leetcode') {
        await expect(calendar.locator('.heatmap')).toHaveAttribute('aria-busy', 'false');
        expect(await position(calendar)).toEqual(calendarBefore);
      }
      const before = await position(region);
      state.hold = gate();
      await pullDown(page, '.mobile-page-scroll');
      await expect(region.getByRole('status', { name: '正在更新内容' })).toBeVisible();
      await expect(region.getByText(empty, { exact: true })).toBeVisible();
      expect(await position(region)).toEqual(before);
      await region.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('refresh-empty.png') });
      state.fail = true;
      state.hold.release();
      const retry = region.getByRole('button', { name: /重试/ });
      await expect(retry).toBeVisible();
      expect(await position(region)).toEqual(before);
      const calls = { ...state.calls };
      state.fail = false;
      state.hold = gate();
      await retry.click();
      await expect(region.getByRole('status', { name: '正在更新内容' })).toBeVisible();
      state.hold.release();
      await expect(retry).toHaveCount(0);
      await expect(region.getByRole('status')).toHaveCount(0);
      expect(state.calls[slow]).toBe(calls[slow] + 1);
      for (const key of Object.keys(calls).filter(key => key !== slow)) expect(state.calls[key], key).toBe(calls[key]);
      expect(await position(region)).toEqual(before);
      await page.screenshot({ path: info.outputPath('recovered.png'), fullPage: true });
    } finally { state.user.release(); state.hold.release(); }
  });
}
