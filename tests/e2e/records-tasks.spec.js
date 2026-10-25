const { test, expect } = require('@playwright/test')
const { dashboardFixture } = require('./fixtures.js')
const id = '9223372036854775807'
async function setup(page) {
  const state = { goals: [{ id, title: '模拟月目标', type: 3, status: 'in_progress', currentValue: 2, targetValue: 10, description: '模拟描述', content: '每日记录', parentId: '9223372036854775806', tags: '["阅读"]' }], columns: [{ id: '8', title: '模拟计划', bgColor: '' }], tasks: [{ id, columnId: '8', content: '模拟待办', detail: '模拟说明', unCompletedCount: 1 }], details: [{ id: '7', taskId: id, content: '模拟明细', priority: 20, isCompleted: 0, isStarred: 0 }], writes: [], failSave: false }
  await page.route('http://127.0.0.1:5180/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    let data = dashboardFixture(path)
    if (path === '/api/auth/login') data = { accessToken: 'records-fixture' }
    if (path === '/api/user/info') data = { id: '6', nickname: '模拟用户', accountUsername: 'fixture' }
    if (path === '/api/goals' && method === 'GET') data = state.goals
    if (path === '/api/taskColumn/query') data = { items: state.columns, total: 1 }
    if (path === '/api/tasks' && method === 'GET') data = { items: state.tasks, total: 1 }
    if (path === '/api/taskDetails' && method === 'GET') data = state.details.filter(item => item.taskId === new URL(request.url()).searchParams.get('taskId'))
    if (method !== 'GET' && path !== '/api/auth/login') {
      const body = request.postData() ? request.postDataJSON() : null
      state.writes.push({ path, method, body })
      if (state.failSave) return route.fulfill({ json: { code: 1, message: '模拟保存失败' } })
      if (path === '/api/goals') { data = { ...body }; Object.assign(state.goals.find(g => g.id === body.id), body) }
      else if (path === '/api/taskDetails' && method === 'PUT') { Object.assign(state.details.find(item => item.id === body.id), body); data = true }
      else if (path === '/api/taskDetails' && method === 'POST') { data = { ...body, id: '9223372036854775805' }; state.details.push(data) }
      else if (path.startsWith('/api/taskDetails/star/')) { state.details[0].isStarred = 1; data = true }
      else data = true
    }
    await route.fulfill({ json: { code: 0, data: data === undefined ? [] : data } })
  })
  await page.goto('/')
  await page.locator('[aria-label="账号"] input').fill('fixture')
  await page.locator('[aria-label="密码"] input').fill('fixture-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.locator('.dashboard-scroll')).toBeVisible()
  return state
}
for (const width of [390, 768, 1440]) for (const theme of ['light', 'dark']) {
  test(`目标布局与保存恢复 ${width} ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme })
    const state = await setup(page)
    await page.goto('/#/pages/tasks/goals')
    await expect(page.getByText('模拟月目标', { exact: true })).toBeVisible()
    await page.locator('[aria-label^="编辑目标："]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.locator('[aria-label="标题"] input').fill('模拟目标更新')
    state.failSave = true
    await page.locator('[aria-label="保存"]').click()
    await expect(page.getByText('模拟保存失败', { exact: true })).toBeVisible()
    await expect(page.locator('[aria-label="标题"] input')).toHaveValue('模拟目标更新')
    state.failSave = false
    await page.locator('[aria-label="保存"]').click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const write = state.writes.filter(w => w.path === '/api/goals').at(-1)
    expect(write.body.id).toBe(id); expect(write.body.parentId).toBe('9223372036854775806'); expect(write.body.content).toBe('每日记录')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
test('待办明细完成和关注保留关联', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/#/pages/tasks/todo')
  await expect(page.getByText('模拟明细', { exact: true })).toBeVisible()
  await page.locator('[aria-label="完成明细"]').click()
  await expect(page.locator('[aria-label="标为未完成"]')).toHaveCount(0)
  await page.getByRole('button', { name: '展开已完成：模拟待办', exact: true }).click()
  await expect(page.locator('[aria-label="标为未完成"]')).toBeVisible()
  expect(state.writes.at(-1).body.taskId).toBe(id)
  await page.locator('[aria-label="关注明细"]').click()
  expect(state.writes.at(-1).path).toBe('/api/taskDetails/star/7')
})

test('待办列超过公共页上限时逐页获取，失败重试保留完整看板', async ({ page }) => {
  const state = await setup(page)
  state.columns = Array.from({ length: 201 }, (_, index) => ({ id: String(index + 8), title: '分页列' + index, bgColor: '' }))
  const calls = [], taskCalls = []
  let fail = true
  await page.route('**/api/taskColumn/query?**', async route => {
    const params = new URL(route.request().url()).searchParams
    const number = Number(params.get('page')), pageSize = Number(params.get('pageSize'))
    expect(pageSize).toBe(200)
    expect(params.has('current') || params.has('size') || params.has('get')).toBe(false)
    calls.push(number)
    if (number === 2 && fail) return route.fulfill({ json: { code: 1, message: '模拟列分页失败' } })
    await route.fulfill({ json: { code: 0, data: { items: state.columns.slice((number - 1) * pageSize, number * pageSize), total: state.columns.length } } })
  })
  await page.route('**/api/tasks?**', async route => {
    const params = new URL(route.request().url()).searchParams
    const number = Number(params.get('page'))
    expect(params.get('pageSize')).toBe('100')
    expect(params.has('get')).toBe(false)
    taskCalls.push(number)
    const items = Array.from({ length: number === 1 ? 100 : 1 }, (_, index) => ({ id: String(1000 + number * 100 + index), columnId: '8', content: '分页任务' + number + '-' + index, unCompletedCount: 0 }))
    await route.fulfill({ json: { code: 0, data: { items, total: null } } })
  })
  await page.goto('/#/pages/tasks/todo')
  await expect(page.getByText('模拟列分页失败', { exact: true })).toBeVisible()
  expect(calls).toEqual([1, 2])
  fail = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('button', { name: '分页列200', exact: true })).toHaveCount(1)
  expect(calls).toEqual([1, 2, 1, 2])
  await expect(page.locator('.task-card')).toHaveCount(101)
  expect(taskCalls).toEqual([1, 2])
})

test('待办任务与明细保存使用统一日期时间格式和完整字符串 ID', async ({ page }) => {
  const state = await setup(page)
  state.tasks[0].dueDate = '2026-10-22 10:30:45'
  state.details[0].startTime = '2026-10-22 09:30:45'
  state.details[0].endTime = '2026-10-22 10:30:45'
  await page.goto('/#/pages/tasks/todo')
  await page.getByRole('button', { name: '编辑清单：模拟待办', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑待办', exact: true })).toHaveCount(0)
  expect(state.writes.at(-1)).toMatchObject({ path: '/api/tasks/' + id, method: 'PUT', body: { columnId: '8', dueDate: '2026-10-22 10:30:45' } })
  await page.getByRole('button', { name: '编辑明细：模拟明细', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑待办', exact: true })).toHaveCount(0)
  expect(state.writes.at(-1)).toMatchObject({ path: '/api/taskDetails', method: 'PUT', body: { id: '7', taskId: id, startTime: '2026-10-22 09:30:45', endTime: '2026-10-22 10:30:45' } })
})


test('组内快速添加失败保留输入，回车重试不重复提交且保留大整数归属', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/#/pages/tasks/todo')
  await expect(page.getByText('模拟明细', { exact: true })).toBeVisible()
  const input = page.locator('[aria-label="添加待办到模拟待办"] input')
  await input.fill('模拟快速添加')
  state.failSave = true
  await input.press('Enter')
  await expect(page.getByText('模拟保存失败', { exact: true })).toBeVisible()
  await expect(input).toHaveValue('模拟快速添加')
  state.failSave = false
  await input.press('Enter')
  await expect(page.getByText('模拟快速添加', { exact: true })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.writes.filter(write => write.path === '/api/taskDetails' && write.method === 'POST')).toHaveLength(2)
  expect(state.writes.at(-1).body).toMatchObject({ taskId: id, content: '模拟快速添加', priority: 20, isCompleted: 0 })
})

test('清单加载失败独立重试，搜索包含明细，已完成按清单展开', async ({ page }) => {
  const state = await setup(page)
  state.tasks.push({ id: '9223372036854775806', columnId: '8', content: '第二清单' })
  let fail = true
  await page.route('**/api/taskDetails?*', async route => {
    const taskId = new URL(route.request().url()).searchParams.get('taskId')
    if (taskId === id) return route.fulfill({ json: { code: 0, data: state.details } })
    if (fail) return route.fulfill({ json: { code: 1, message: '模拟第二清单失败' } })
    return route.fulfill({ json: { code: 0, data: [{ id: '88', taskId, content: '已完成的模拟事项', priority: 20, isCompleted: 1 }] } })
  })
  await page.goto('/#/pages/tasks/todo')
  await expect(page.getByText('模拟明细', { exact: true })).toBeVisible()
  await expect(page.getByText('模拟第二清单失败', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByRole('button', { name: '展开已完成：第二清单', exact: true })).toBeVisible()
  await expect(page.getByText('已完成的模拟事项', { exact: true })).toHaveCount(0)
  await page.locator('[aria-label="搜索任务"] input').fill('已完成的模拟事项')
  await expect(page.locator('.task-card')).toHaveCount(1)
  await page.getByRole('button', { name: '展开已完成：第二清单', exact: true }).click()
  await expect(page.getByText('已完成的模拟事项', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([])
})

test('首页明细深链仍直接打开编辑器', async ({ page }) => {
  await setup(page)
  await page.goto('/#/pages/tasks/todo?taskId=' + id + '&detailId=7')
  await expect(page.getByRole('dialog', { name: '编辑待办', exact: true })).toBeVisible()
  await expect(page.locator('[aria-label="内容"] input')).toHaveValue('模拟明细')
})
