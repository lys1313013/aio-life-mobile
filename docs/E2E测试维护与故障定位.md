# E2E 测试维护与故障定位

目的：让失败准确指向业务回归、测试契约过时或运行环境问题，减少依赖执行速度与 DOM 包装结构的误报。不能以增加重试、放宽业务断言、跳过用例或缩减尺寸/主题覆盖来消除红灯。

## 页面改动需要同步什么

| 改动 | 同批检查与维护 |
| --- | --- |
| 弹窗改页面、入口移动、导航返回调整 | 路由、返回栈、未保存表单保留、可访问名称；查找旧测试对 dialog/旧按钮的假设 |
| 接口地址、参数、响应字段变更 | API fixture、请求断言与当前响应契约；成功码 `0`、字符串 ID、分页对象不能用 `[]` 代替 |
| 图标按钮、弹窗层级变化 | 优先 `getByRole` + 明确名称，嵌套弹窗限定具体 dialog；不得用 `.last()` 或 `force: true` 消除歧义 |
| loading、刷新或缓存策略变化 | 首次加载、已有内容刷新、失败重试；只等实际受影响区域，按完成时间建立缓存时钟基准 |
| 主题、容器或动画变化 | 测量真正绘制背景/内容的节点；透明包装层不能作为背景颜色断言对象；保留对比度与遮挡检查 |
| 间距、排版、tabBar、图标目录变化 | 运行对应 generate，再运行 check；核对需要提交的生成文件，不能手改或漏交 |

先检索受影响测试再改页面。例如：

```bash
rg -n 'pages/auth/policy|隐私政策|服务条款|auth/legal' tests/e2e src
npm run e2e:check
```

不要求页面每改一次就运行全量验证。修复时用具体失败用例定位；提交前按 AGENTS.md 执行最终验证。用户明确不测试时，只做静态检查并如实标记未运行。

## 从失败证据定位

1. 先看 Actions 对应 job 的 Summary。显示失败用例数和“测试声明 + 首个失败位置 + 状态”的分组，避免把同一断言在六种视口/主题下的失败误当成六个根因。分片分别汇总；分组只是线索，不自动认定是测试问题。
2. 下载 `playwright-<分片>` 附件，查看 `artifacts/e2e-diagnostics/summary.json`：包含示例步骤、首个错误片段、用例与附件路径。启动失败、全局错误、跳过、重试后通过、中断分别保留；摘要有本次时间与耗时。
3. 打开 HTML 报告，查看该用例的 `failure-context`：最近 80 条 API/导航/页面异常事件、未结束请求、当前页面和视口。API 记录区分 response 与 requestfinished，响应头到达不等于正文处理完成。页面错误只记录类型，具体堆栈从 trace 查看。
4. 对照截图和 trace 的失败动作、DOM、请求响应及实际业务状态，再判断修哪里。故意模拟的 401/403、业务失败和取消请求不是自动判错依据；HTTP 200 也不能证明业务成功。

| 证据 | 优先检查 |
| --- | --- |
| `fixture 未声明此 API` | 新接口/请求方法是否已经同步 mock；用当前真实契约补数据，禁止统一成功空数组 |
| 路由正确但 locator 指向旧弹窗/旧名称 | 用户流程是否已改变；更新测试并保留新流程的业务断言 |
| 点击被遮罩拦截、操作超出视口、按钮 disabled | 看截图和命中区域，确认是否真实可操作；不能强制点击 |
| 内容已经展示却报缓存过期边界错误 | 初次加载完成时刻、Vue 更新和计时基准，不能从测试开始时间直接加 TTL |
| 只有慢机器失败、存在固定延时 | 找可观察的完成状态/明确响应；不要单纯增加 sleep 或全局 timeout |
| 多个无关页面共同失败、浏览器 crash、预览无法启动 | 浏览器/镜像版本、构建产物、端口与资源；此时没有 DOM 证据不能判业务失败 |
| 内容、响应或布局确实不符合需求 | 修复产品代码，保留原有有效断言 |

本地查看和最小复现（会执行测试的命令仅在需要定位或最终验证时运行）：

```bash
npx playwright show-report playwright-report
npx playwright show-trace test-results/<失败用例目录>/trace.zip
npm run test:e2e -- tests/e2e/auth-policy.spec.js --grep '390 light' --workers=1
# 单次通过不足以证明偶发问题已消失；怀疑竞态且已经修复时才重复受影响用例。
npm run test:e2e -- tests/e2e/auth-policy.spec.js --grep '390 light' --workers=2 --repeat-each=3
```

本地执行仍构建当前 H5；不要设置 `AIO_E2E_PREBUILT=1` 偷用历史产物。保留 CI 的四分片完整覆盖、固定 Playwright 版本和 `retries: 0`。本地与 CI 都生成 HTML 与分组摘要，CI 上传到同一分片附件。诊断文件为忽略的运行产物，不提交。

## 编写稳定且有用的用例

所有 `*.spec.js` 从 `./support/test` 导入 `test/expect`，自动接入诊断。监听器不会更改断言、网络路由、时钟或超时；`failure-context` 不收集请求头、请求体、响应体、查询值与 console 文本。HTML/trace/错误片段仍含页面内容和 fixture，所有测试必须只使用模拟账号和数据。手动创建的其他 browser context 需自行接入诊断，不能假设默认 context 的监听器覆盖它。

新建独立业务流程使用严格的 `apiMock` fixture；键包含 HTTP 方法和路径，query 在处理函数中按契约单独断言。它只接管本用例的 `/api/**`，未声明接口返回 400 避免通用 5xx 重试，并在清理阶段报出漏项；不会因页面其它断言暂时通过而漏报。外部服务另行显式 mock。

```js
const { test, expect } = require('./support/test');

test('协议内容', async ({ page, apiMock }) => {
  apiMock({
    'GET /api/auth/legal': {
      json: { code: 0, message: null, data: require('./support/legal-fixture') },
    },
  });
  await page.goto('/#/pages/auth/policy?kind=privacy');
  await expect(page.getByText('仅用于模拟隐私政策页面验证。', { exact: true })).toBeVisible();
});
```

- **等待业务状态**：用 `toBeVisible`、`toHaveText`、`toHaveCount`、`toHaveURL` 或带说明的 `expect.poll`；点击触发请求时先注册 `waitForResponse` 再点击，并继续断言 UI 更新。全站 `networkidle` 会受到无关预取/轮询影响，也无法证明 Vue 已完成业务更新。
- **不要把负向断言变成瞬时通过**：验证“不重复请求”“旧响应不覆盖新数据”时，先确认触发事件已处理，或用 gate 明确释放旧响应并等待完成；不能用会立即成功的 `expect.poll(count).toBe(原值)` 假装观察了一段时间。涉及 debounce/TTL 时使用受控时钟，推进业务需要的时间；网络请求仍需单独等待。
- **区分动作时长和就绪等待**：长按后等待 dragging 状态即可；手势速度/惯性、双击阈值和否定行为观察窗口可能确实需要时间，应注明对应机制并验证最终结果。不能全局关闭动画，也不能把所有 sleep 机械换成零。
- **布局测量保持业务含义**：在相关内容加载完成后测量实际容器；比较 loading→内容、已有内容刷新以及下一块的位置。不要删除断言、扩大容差或永久留白掩盖跳动。需要坐标手势时先确认目标可见且位置稳定，不能靠 `.boundingBox()` 返回非空就假设动画完成。
- **失败要指向一个流程**：无关业务分成独立 test；单个流程用 `test.step` 标出准备、操作、结果与返回。优先 `getByRole({name, exact:true})`，重复名称通过所属卡片/具体 dialog 限定；CSS 定位用于确有布局含义的节点。测试接口语义与用户行为，不把透明包装层、内部 class 数量作为业务契约。
- **受控异步必须释放**：用 gate 暂停响应验证 loading；在 `finally`/afterEach 释放并清理路由，防止失败后悬挂。各用例的新 context 保持隔离，不能依赖前一个测试登录、缓存或后台定时器。

## 历史债务与自动约束

`npm run e2e:check` 检查所有 spec 的统一入口，并按文件约束 `waitForTimeout`、`networkidle`、`force: true` 的历史数量；`npm test` 和 CI 的单元阶段也执行同一检查。基线在 `tests/e2e-maintenance-budget.json`，只允许随修复下降，不能为了通过而扩大。删除旧写法后同步降低对应数值。

这是词法数量护栏，不是完整语义分析：不能自动发现所有竞态，也不能保证同一数量下的修改合理。触及有债务的用例时，结合上述规则逐项改进；新增流程从零债务开始。通用 mock 中的 `data ?? []` 也仍需逐流程迁移，不能把既有兜底当成新用例模板。

本轮先完成：全部 spec 接入诊断；协议六种尺寸/主题从长流程中拆出，保留内容/版本/联系方式/返回后邮箱断言并增加失败重试；银行卡排序五处固定长按等待改为等待拖动态；GitHub 分页移除重复的全站空闲等待。剩余手势、负向观察窗口及历史页面审计没有盲目重写，清单以基线文件为准。这些改动不等于已经验证所有未来页面改动，也不能替代最终代码的实际回归。
