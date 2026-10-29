/** H5 鼠标适配：内容翻页仍由 swiper 处理，只补标签拖动和拖动后的点击隔离。 */
export function bindPagerMouseDrag(root: HTMLElement, pagerSelector: string, tabsSelector: string) {
  let startX = 0, startY = 0, startScroll = 0;
  let tracking = false, moved = false;
  let suppressClick = false;
  let scroll: HTMLElement | null = null;
  function down(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const region = target.closest(pagerSelector + ', ' + tabsSelector);
    if (!region || target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.button !== 0) return;
    tracking = true;
    moved = false;
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    // H5 scroll-view 的实际滚动节点；触屏仍走组件原生滚动。
    scroll = region.matches(tabsSelector) ? region.querySelector('.uni-scroll-view-scrollbar-hidden') : null;
    startScroll = scroll?.scrollLeft || 0;
    // 避免文字选中和图片原生拖放抢占 swiper 的 mousemove / mouseup。
    event.preventDefault();
  }
  function move(event: MouseEvent) {
    if (!tracking) return;
    const dx = event.clientX - startX, dy = event.clientY - startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 6) moved = true;
    if (scroll && moved && Math.abs(dx) > Math.abs(dy)) {
      scroll.scrollLeft = startScroll - dx;
      event.preventDefault();
    }
  }
  function up() {
    if (!tracking) return;
    tracking = false;
    suppressClick = moved;
    scroll = null;
  }
  function click(event: MouseEvent) {
    // detail=0 是键盘/辅助技术激活；正常点击在下一次 mousedown 时重新放行。
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function blur() {
    if (!tracking) return;
    // 让 swiper 收到释放，避免窗口失焦后仍跟随鼠标。
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: startX, clientY: startY }));
    up();
  }
  root.addEventListener('mousedown', down, true);
  root.addEventListener('click', click, true);
  document.addEventListener('mousemove', move, true);
  document.addEventListener('mouseup', up, true);
  window.addEventListener('blur', blur);
  return () => {
    blur();
    root.removeEventListener('mousedown', down, true);
    root.removeEventListener('click', click, true);
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('mouseup', up, true);
    window.removeEventListener('blur', blur);
  };
}
