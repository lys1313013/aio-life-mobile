const { expect } = require('./test');

// 坐标手势和几何测量不经过 locator 的稳定性等待，须等真实动效结束。
async function waitForMotion(page) {
  // 动画异常时给出明确失败，而不是耗尽整个测试预算后被误报为测试超时。
  await page.waitForFunction(() => !document.documentElement.classList.contains('aio-page-motion')
    && document.getAnimations().every(animation => {
      const timing = animation.effect?.getComputedTiming();
      return timing?.iterations === Infinity || (!animation.pending && animation.playState !== 'running');
    }), null, { timeout: 15000 });
}

async function capturePageMotion(page, direction, path) {
  await page.waitForFunction(() => {
    const animations = document.getAnimations().filter(a => ['::view-transition-new(root)', '::view-transition-old(root)'].includes(a.effect?.pseudoElement));
    if (animations.length !== 2) return false;
    animations.forEach(animation => { animation.pause(); animation.currentTime = 120; });
    return true;
  });
  try {
    await expect(page.locator('html')).toHaveClass(direction === 'back' ? /aio-page-motion-back/ : /aio-page-motion/);
    const frames = await page.evaluate(() => document.getAnimations().filter(a => a.effect?.pseudoElement?.includes('view-transition'))
      .map(a => ({ target: a.effect.pseudoElement, transforms: a.effect.getKeyframes().map(f => f.transform) })));
    const incoming = frames.find(frame => frame.target.includes('new'));
    const outgoing = frames.find(frame => frame.target.includes('old'));
    expect(incoming.transforms[0]).toContain(direction === 'back' ? '-25%' : '100%');
    expect(outgoing.transforms[1]).toContain(direction === 'back' ? '100%' : '-25%');
    await page.screenshot({ path, fullPage: true });
  } finally {
    await page.evaluate(() => document.getAnimations().filter(a => a.effect?.pseudoElement?.includes('view-transition')).forEach(a => a.play()));
  }
  await expect(page.locator('html')).not.toHaveClass(/aio-page-motion/);
}

async function captureModalMotion(page, leaving, path) {
  await page.waitForFunction(exit => {
    const mask = [...document.querySelectorAll('.modal-mask')].find(node => (node.getAttribute('aria-hidden') === 'true') === exit);
    if (!mask) return false;
    const panel = mask.querySelector('.modal-panel');
    const animations = document.getAnimations().filter(a => a.effect?.target === mask || a.effect?.target === panel);
    if (animations.length !== 2) return false;
    animations.forEach(animation => { animation.pause(); animation.currentTime = 100; });
    return true;
  }, leaving);
  try {
    await page.screenshot({ path, fullPage: true });
  } finally {
    await page.evaluate(() => document.querySelectorAll('.modal-mask').forEach(mask => mask.getAnimations({ subtree: true }).forEach(a => a.play())));
  }
}

module.exports = { capturePageMotion, captureModalMotion, waitForMotion };
