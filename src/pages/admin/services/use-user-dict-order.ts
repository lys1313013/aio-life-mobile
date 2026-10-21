import type { Ref } from 'vue';
import { getCurrentInstance, nextTick, onUnmounted, ref } from 'vue';
import spacing from '../../../styles/spacing.json';

/** 静止长按才接管手势；短滑保留页面滚动，排序只提交一次相对落点。 */
export function useUserDictOrder(options: {
  rows: Ref<any[]>;
  disabled: () => boolean;
  save: (row: any, target: any, delta: number) => Promise<any>;
  activated: () => void;
}) {
  const instance = getCurrentInstance();
  const dragging = ref(''), saving = ref(''), target = ref(''), offset = ref(0), scrollTop = ref(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scrolling: ReturnType<typeof setInterval> | undefined;
  let startX = 0, startY = 0, lastY = 0, startScroll = 0, actualScroll = 0, from = -1, to = -1;
  let pendingOriginal: any[] | null = null;
  let rects: any[] = [], snapshot: any[] = [], version = 0, requestVersion = 0, suppressUntil = 0;
  let viewportTop = 0, viewportBottom = 0, maxScroll = 0;
  function cancel() {
    version++;
    clearTimeout(timer); clearInterval(scrolling);
    timer = scrolling = undefined;
    if (dragging.value) suppressUntil = Date.now() + 450;
    dragging.value = target.value = ''; offset.value = 0;
  }
  function reset() {
    cancel(); requestVersion++;
    if (pendingOriginal) options.rows.value = pendingOriginal;
    pendingOriginal = null; saving.value = '';
  }
  function blocked() { return !!saving.value || options.disabled(); }
  function sameRows() { return snapshot.map(row => row.id).join(',') === options.rows.value.map(row => row.id).join(','); }
  function update() {
    if (!dragging.value) return;
    if (!sameRows()) { cancel(); return; }
    offset.value = lastY - startY + actualScroll - startScroll;
    const top = rects[from].top + offset.value;
    let distance = Infinity;
    snapshot.forEach((row, index) => {
      if (row.userId !== '0' || row.dictType !== snapshot[from].dictType) return;
      const delta = Math.abs(top - rects[index].top);
      if (delta < distance) { distance = delta; to = index; }
    });
    target.value = snapshot[to]?.id || '';
  }
  function start(id: string, event: any) {
    cancel();
    if (blocked() || event.touches?.length !== 1) return;
    snapshot = options.rows.value.slice(); from = snapshot.findIndex(row => row.id === id); to = from;
    if (from < 0 || snapshot[from].userId !== '0' || snapshot.filter(row => row.dictType === snapshot[from].dictType && row.userId === '0').length < 2) return;
    const point = event.touches[0], revision = version;
    startX = point.clientX; startY = lastY = point.clientY; startScroll = actualScroll;
    timer = setTimeout(() => {
      if (revision !== version || blocked() || !sameRows()) return;
      uni.createSelectorQuery().in(instance?.proxy)
        .selectAll('.user-dict-sort-item').boundingClientRect()
        .exec(result => {
          if (revision !== version || blocked() || !sameRows()) return;
          rects = result?.[0] || [];
          if (rects.length !== snapshot.length) return;
          options.activated(); dragging.value = target.value = id;
          viewportTop = spacing.controlMin * 2;
          viewportBottom = uni.getWindowInfo().windowHeight;
          maxScroll = Math.max(actualScroll, ...rects.map(rect => rect.bottom + actualScroll - viewportBottom + spacing.page));
          uni.vibrateShort({ fail: () => {} });
          scrolling = setInterval(() => {
            const step = lastY < viewportTop ? -spacing.inline : lastY > viewportBottom - spacing.controlMin ? spacing.inline : 0;
            if (step) scrollTop.value = Math.max(0, Math.min(maxScroll, actualScroll + step));
          }, 40);
        });
    }, 350);
  }
  function move(event: any) {
    if (event.touches?.length !== 1) { cancel(); return; }
    const point = event.touches[0]; lastY = point.clientY;
    if (!dragging.value) {
      if (Math.max(Math.abs(point.clientX - startX), Math.abs(lastY - startY)) > spacing.inline) cancel();
      return;
    }
    event.preventDefault?.(); event.stopPropagation?.(); update();
  }
  function scrolled(event: any) {
    actualScroll = event.detail.scrollTop; scrollTop.value = actualScroll;
    if (!dragging.value && timer && Math.abs(actualScroll - startScroll) > spacing.inline) cancel();
    update();
  }
  async function save(row: any, destination: any, delta: number) {
    if (blocked() || row.id === destination.id) return;
    const revision = ++requestVersion, original = options.rows.value.slice();
    const reordered = original.filter(item => item.id !== row.id);
    reordered.splice(reordered.findIndex(item => item.id === destination.id) + (delta > 0 ? 1 : 0), 0, row);
    pendingOriginal = original; saving.value = row.id; options.rows.value = reordered;
    try {
      const ranks = await options.save(row, destination, delta);
      if (revision !== requestVersion) return;
      if (!Array.isArray(ranks) || !ranks.some(item => item.id === row.id) || !ranks.some(item => item.id === destination.id)) throw Error('排序结果异常，请重试');
      const byId = new Map<string, number>();
      for (const item of ranks) {
        if (typeof item.id !== 'string' || !Number.isInteger(item.dictSort) || item.dictSort < 0 || byId.has(item.id)) throw Error('排序结果异常，请重试');
        byId.set(item.id, item.dictSort);
      }
      options.rows.value = options.rows.value.map(item => byId.has(item.id) ? { ...item, dictSort: byId.get(item.id) } : item);
    } catch (reason) {
      if (revision !== requestVersion) return;
      options.rows.value = original;
      uni.showToast({ title: reason.message || '排序保存失败，请重试', icon: 'none' });
    } finally { if (revision === requestVersion) { pendingOriginal = null; saving.value = ''; } }
  }
  async function finish(event?: any) {
    if (!dragging.value) { cancel(); return; }
    event?.preventDefault?.(); event?.stopPropagation?.();
    const row = snapshot[from], destination = snapshot[to], delta = to - from, valid = sameRows();
    cancel(); const revision = version;
    if (instance?.proxy) await instance.proxy.$nextTick(); else await nextTick();
    if (valid && revision === version && sameRows() && destination && delta) void save(row, destination, delta);
  }
  function keyboard(id: string, delta: number) {
    const rows = options.rows.value, index = rows.findIndex(row => row.id === id), row = rows[index], destination = rows[index + delta];
    if (row?.userId === '0' && destination?.userId === '0' && row.dictType === destination.dictType) void save(row, destination, delta);
  }
  function style(id: string) {
    if (!dragging.value) return {};
    const index = snapshot.findIndex(row => row.id === id);
    let shift = 0;
    if (id === dragging.value) shift = offset.value;
    else if (from < to && index > from && index <= to) shift = -rects[from].height;
    else if (from > to && index >= to && index < from) shift = rects[from].height;
    return { transform: `translateY(${shift}px)`, zIndex: id === dragging.value ? 5 : 1, transition: id === dragging.value ? 'none' : 'transform 160ms ease-out' };
  }
  function clickBlocked() { return !!dragging.value || !!saving.value || Date.now() < suppressUntil; }
  onUnmounted(reset);
  return { dragging, saving, target, scrollTop, start, move, finish, cancel, reset, scrolled, keyboard, style, clickBlocked };
}
