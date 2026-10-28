const base = require('@playwright/test');
const { safePath, createRecorder } = require('./diagnostics.cjs');

// 所有 spec 使用此入口。监听器不改变路由、时钟、超时或断言结果。
const test = base.test.extend({
  apiMock: async ({ page }, use) => {
    let handlers = {};
    const unhandled = new Set();
    const route = async route => {
      const request = route.request();
      const key = `${request.method()} ${new URL(request.url()).pathname}`;
      if (!Object.hasOwn(handlers, key)) {
        unhandled.add(`${request.method()} ${safePath(request.url())}`);
        // 使用 4xx 避免业务 GET 的 5xx 重试掩盖 fixture 漏项。
        await route.fulfill({ status: 400, json: { code: 1, message: 'E2E fixture 未声明此 API' } });
        return;
      }
      const handler = handlers[key];
      await route.fulfill(typeof handler === 'function' ? await handler(request) : handler);
    };
    await page.route('**/api/**', route);
    try { await use(value => { handlers = value; }); }
    finally {
      await page.unroute('**/api/**', route);
      base.expect([...unhandled], '出现未声明的 API，请按当前接口契约补充 fixture，禁止兜底返回成功空数组').toEqual([]);
    }
  },
  failureDiagnostics: [async ({ context }, use, testInfo) => {
    const recorder = createRecorder();
    const cleanups = [];
    function listen(target, event, handler) {
      target.on(event, handler);
      cleanups.push(() => target.off(event, handler));
    }
    function observePage(page) {
      listen(page, 'pageerror', error => recorder.record({ type: 'pageerror', name: error.name }));
      listen(page, 'crash', () => recorder.record({ type: 'crash' }));
      listen(page, 'framenavigated', frame => {
        if (frame === page.mainFrame()) recorder.record({ type: 'navigation', path: safePath(frame.url()) });
      });
    }
    context.pages().forEach(observePage);
    listen(context, 'page', observePage);
    listen(context, 'request', recorder.request);
    listen(context, 'response', recorder.response);
    listen(context, 'requestfinished', request => recorder.finish(request));
    listen(context, 'requestfailed', request => recorder.finish(request, true));
    try { await use(); }
    finally {
      cleanups.forEach(cleanup => cleanup());
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach('failure-context', {
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify({
            status: testInfo.status,
            retry: testInfo.retry,
            pages: context.pages().map(page => ({ path: safePath(page.url()), viewport: page.viewportSize() })),
            ...recorder.snapshot(),
          }, null, 2)),
        });
      }
    }
  }, { auto: true }],
});

module.exports = { test, expect: base.expect };
