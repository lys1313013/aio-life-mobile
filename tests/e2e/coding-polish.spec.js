const { test, expect } = require('@playwright/test');
const { dashboardFixture } = require('./fixtures');

// Explicitly synthetic records. Every API and external coding request is intercepted.
async function setup(page) {
  await page.addInitScript(() => localStorage.setItem('aio-life-mobile.access-token.v1', 'coding-polish-fixture'));
  const exercise = [
    { id: '91', exerciseTypeId: '81', exerciseDate: '2026-10-01', exerciseCount: 120, description: '模拟三组训练，保留独立明细' },
    { id: '92', exerciseTypeId: '82', exerciseDate: '2026-09-30', exerciseCount: 20, description: '模拟记录' },
  ];
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = dashboardFixture(path);
    if (path === '/api/user/info') data = { id: '1', accountUsername: 'fixture', nickname: '模拟用户', roles: ['admin'] };
    if (path === '/api/userbinds/list') data = ['github', 'leetcode', 'csdn'].map(platform => ({ platform, platformUsername: 'fixture', accessToken: 'fixture-token' }));
    if (path === '/api/csdn/stats') data = { viewCount: 231819, originalCount: 81, rank: 13599, fansCount: 3905, likeCount: 864, commentCount: 32 };
    if (path === '/api/csdn/articles') data = [1, 2].map(id => ({ id: String(id), title: id === 1 ? '模拟文章：从需求分析到完整业务实现的工程实践与经验总结' : '模拟文章：开发记录', description: '模拟摘要，展示多行内容与日期、浏览量、评论、点赞、收藏的层级。', postTime: '2026-10-01', viewCount: 1234, commentCount: 12, likeCount: 48, collectCount: 16, url: 'https://example.com/fixture' }));
    if (path === '/api/github/recent-commits') data = [1, 2].map(id => ({ id: String(id), repo: 'fixture/mobile-client', message: id === 1 ? 'feat: 完善跨端页面布局与长标题的响应式适配，保留所有业务字段和编辑入口' : 'fix: 调整卡片信息层级', date: '2026-10-01 18:30', actor: 'fixture', commitUrl: 'https://example.com/fixture' }));
    if (path.endsWith('/getByDictType')) data = { dictDetailList: [{ id: '81', dictLabel: '正握引体向上', label: '演唱会', value: '1' }, { id: '82', dictLabel: '俯卧撑', label: '音乐节', value: '2' }] };
    if (path === '/api/exerciseRecord/query') data = { items: exercise, total: exercise.length };
    if (path === '/api/performance') data = {total: 3, items: [1, 2, 3].map(id => ({ id: String(id), performanceName: id === 1 ? '模拟活动：2026城市星空音乐节特别纪念场' : '模拟活动：夏夜演唱会', performer: '模拟歌手', performanceType: id === 1 ? '2' : '1', performanceDate: '2026-10-01', city: '北京', venue: '模拟城市音乐公园中央舞台', files: [] })) };
    await route.fulfill({ json: { rscode: '0', data: data ?? [] } });
  });
  await page.route('https://api.github.com/**', async route => {
    const url = new URL(route.request().url()); let data = [];
    if (url.pathname === '/graphql') data = { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 1682, weeks: Array.from({ length: 52 }, (_, week) => ({ contributionDays: Array.from({ length: 7 }, (_, day) => ({ date: new Date(Date.UTC(2025, 9, 2 + week * 7 + day)).toISOString().slice(0, 10), contributionCount: (week + day) % 5 })) })) } } } } };
    else if (url.pathname.includes('/users/')) data = [1, 2].map(id => ({ id, name: id === 1 ? 'mobile-client-long-repository-name' : 'fixture-service', full_name: 'fixture/repo' + id, description: '模拟项目：跨端生活管理客户端，支持完整记录、数据统计与可访问交互。', language: id === 1 ? 'TypeScript' : 'Java', fork: id === 2, stargazers_count: 124, forks_count: 18, pushed_at: '2026-10-01', html_url: 'https://example.com/fixture' }));
    else if (url.pathname.includes('/contributors')) data = [{ login: 'fixture', contributions: 128 }];
    else data = { parent: { stargazers_count: 1024 } };
    await route.fulfill({ json: data });
  });
  await page.route('**/leetcode-api/**', async route => route.fulfill({ json: { data: {
    userProfilePublicProfile: { siteRanking: 13599, profile: { reputation: 30 } },
    userProfileUserQuestionProgress: { numAcceptedQuestions: [{ difficulty: 'EASY', count: 314 }, { difficulty: 'MEDIUM', count: 427 }, { difficulty: 'HARD', count: 155 }], numUntouchedQuestions: [{ difficulty: 'EASY', count: 774 }, { difficulty: 'MEDIUM', count: 1893 }, { difficulty: 'HARD', count: 894 }], numFailedQuestions: [] },
    userContestRanking: { rating: 1515, globalRanking: 356366, globalTotalParticipants: 896895, localRanking: 72004, localTotalParticipants: 155394 },
    userCalendar: { submissionCalendar: '{}', recentStreak: 100, totalActiveDays: 361 },
    todayRecord: [1, 2].map(id => ({ date: '2026-10-0' + id, userStatus: id === 1 ? 'FINISH' : 'NOT_START', question: { translatedTitle: id === 1 ? '模拟题目：寻找字符串中满足指定条件的最长连续子序列' : '模拟题目：两数之和', titleSlug: 'fixture' } })),
    recentACSubmissions: [1, 2].map(id => ({ submissionId: String(id), submitTime: '1790851200', question: { questionFrontendId: String(id), translatedTitle: '模拟通过题目：动态规划与最长递增子序列', titleSlug: 'fixture' } })),
  } } }));
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) test(`coding and activity polish ${width} ${theme}`, async ({ page }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme }); await setup(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const route of ['coding/github', 'coding/csdn', 'coding/leetcode', 'records/exercise', 'records/activity']) {
    await page.goto('/#/pages/' + route); await expect(page.locator('.page-navigation').last()).toBeVisible();
    if (route === 'coding/github') await expect(page.getByText('mobile-client-long-repository-name', { exact: true })).toBeVisible();
    if (route === 'coding/csdn') await expect(page.locator('.article')).toHaveCount(2);
    if (route === 'coding/leetcode') await expect(page.locator('.difficulty-row')).toHaveCount(3);
    if (route === 'records/exercise') await expect(page.locator('.record-header')).toHaveCount(2);
    if (route === 'records/activity') await expect(page.locator('.activity-card')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(route.replace('/', '-') + '.png'), fullPage: true });
    if (route === 'coding/leetcode' || route === 'records/exercise') {
      await page.locator(route === 'coding/leetcode' ? '.record' : '.record-header').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(route.replace('/', '-') + '-records.png') });
    }
    if (route === 'records/activity') {
      const card = page.getByRole('button', { name: /^编辑活动：/ }).first(); await card.focus(); await card.press('Enter');
      await expect(page.getByRole('dialog', { name: '编辑活动' })).toBeVisible(); await page.getByRole('button', { name: '取消', exact: true }).click();
    }
  }
  expect(errors).toEqual([]);
});
