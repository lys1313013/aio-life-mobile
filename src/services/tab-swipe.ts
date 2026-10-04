import { computed, onUnmounted, ref, watch } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import { createDaySwipe, daySwipeStyle } from './day-swipe.ts';

/** 内容区横滑切换相邻标签，标签栏仍保留自身的横向滚动。 */
export function useTabSwipe(
  index: () => number,
  count: () => number,
  disabled: () => boolean,
  select: (index: number) => void,
) {
  const offset = ref(0);
  const dragging = ref(false);
  const swipe = createDaySwipe(
    () => !disabled(),
    (step) => select(index() + step),
    (value, active) => {
      offset.value = value;
      dragging.value = active;
    },
    (step) => index() >= 0 && index() + step >= 0 && index() + step < count(),
  );
  watch([index, count, disabled], () => swipe.cancel());
  onHide(swipe.cancel);
  onUnmounted(swipe.cancel);
  return {
    swipe,
    dragging,
    style: computed(() => daySwipeStyle(offset.value, dragging.value)),
  };
}
