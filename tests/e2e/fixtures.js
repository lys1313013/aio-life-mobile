const tasks = [
  { type: 'LEETCODE', title: '每日一题', totalTitle: '今日提交' },
  { type: 'GITHUB', title: 'GitHub', totalTitle: '连续提交' },
  { type: 'EXERCISE', title: '今日运动', totalTitle: '连续运动' },
  { type: 'SHANBAY', title: '扇贝单词', totalTitle: '今日时长' },
];
function dashboardFixture(path) {
  if (path === '/api/auth/secondary-lock/menus') return [];
  if (path === '/api/dashboard/tasks') return tasks;
  if (path.startsWith('/api/dashboard/card/')) {
    const item = tasks.find(t => path.endsWith(t.type));
    return { ...item, value: item.type === 'LEETCODE' ? '未完成' : item.type === 'SHANBAY' ? '已打卡' : '3', totalValue: item.type === 'LEETCODE' ? '0' : item.type === 'SHANBAY' ? '18 分钟' : '12 天', valueColor: item.type === 'LEETCODE' ? '#ef4444' : '#3fb27f' };
  }
  if (path === '/api/quick-nav/my') return [{ menuId: '1', title: '待办', path: '/task/todo', enabled: 1, sortOrder: 0 }, { menuId: '2', title: '目标', path: '/task/goal', enabled: 1, sortOrder: 1 }];
  if (path === '/api/thought/dashboard') return [{ id: '1', content: '记录想法，让行动更清晰。', createTime: '2026-09-30 10:00:00' }, { id: '2', content: 'PRIVATE HIDDEN CONTENT', hiddenContent: true }];
  if (path === '/api/taskDetails/watched') return [];
  if (path === '/api/timeTrackerCategory/list') return [{ id: '1', name: '学习', color: '#5b8ff9' }, { id: '2', name: '运动', color: '#3fb27f' }];
  if (path === '/api/timeRecord/query') return [{ id: '1', categoryId: '1', startTime: 540, endTime: 599 }, { id: '2', categoryId: '2', startTime: 660, endTime: 689 }];
  if (path === '/api/exerciseRecord/dashboardSummary') return { hasMore: false, days: ['2026-09-30', '2026-09-29', '2026-09-28'].map((date, i) => ({ date, items: [{ exerciseTypeId: '1', typeLabel: i === 1 ? '俯卧撑' : '跑步', count: 5 - i, deltaCount: 1, color: i === 1 ? '#3b82f6' : '#3fb27f', trend: [3, 2, 4, 3, 5].map((count, j) => ({ date: 'day-' + j, count })) }] })) };
  if (path === '/api/github/recent-commits') return [{ id: '1', repo: 'aio-life-mobile', message: 'feat: add analytics dashboard', date: '2026-09-30T10:30:00' }, { id: '2', repo: 'aio-life', message: 'docs: update getting started', date: '2026-09-29T16:20:00' }];
}
module.exports = { dashboardFixture };
