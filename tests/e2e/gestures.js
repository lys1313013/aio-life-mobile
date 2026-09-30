async function pullDown(page, selector) {
  const scroller = page.locator(selector).last().locator('.uni-scroll-view[style]').first();
  await scroller.evaluate(el => {
    el.scrollTop = 0;
    const point = y => new Touch({ identifier: 1, target: el, clientX: 160, clientY: y, pageX: 160, pageY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [point(140)], changedTouches: [point(140)] }));
    for (const y of [155, 180, 220, 280]) el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [point(y)], changedTouches: [point(y)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [point(280)] }));
  });
}
module.exports = { pullDown };
