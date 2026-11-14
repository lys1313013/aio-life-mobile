const { expect } = require('./test');

// 异步内容、字体度量或弹窗测高完成后布局可能再动一帧；位置断言须等两次读数一致。
async function stableBox(locator, options = {}) {
  const tolerance = options.tolerance ?? 0.5;
  const timeout = options.timeout ?? 5000;
  let previous = null;
  let settled = null;
  await expect.poll(async () => {
    const box = await locator.boundingBox();
    const stable = Boolean(box) && Boolean(previous)
      && Math.abs(box.x - previous.x) <= tolerance
      && Math.abs(box.y - previous.y) <= tolerance
      && Math.abs(box.width - previous.width) <= tolerance
      && Math.abs(box.height - previous.height) <= tolerance;
    previous = box;
    settled = box;
    return stable;
  }, { timeout, message: options.message || '布局尚未稳定，无法测量位置' }).toBe(true);
  return settled;
}

module.exports = { stableBox };
