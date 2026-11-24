import { ref } from 'vue';
import { themeTransitionDuration } from '../../services/theme-transition.ts';
import type { ThemeAppearance } from '../../services/theme.ts';

export function useWeixinThemeReveal() {
  const revealMode = ref<ThemeAppearance | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done: (() => void) | undefined;

  function finishReveal() {
    clearTimeout(timer);
    timer = undefined;
    revealMode.value = null;
    const resolve = done;
    done = undefined;
    resolve?.();
  }

  function revealTheme(mode: ThemeAppearance, update: () => void) {
    update();
    revealMode.value = mode;
    return new Promise<void>(resolve => {
      done = resolve;
      // 离页或渲染层未回传 animationend 时也要释放开关。
      timer = setTimeout(finishReveal, themeTransitionDuration + 200);
    });
  }

  return { revealMode, revealTheme, finishReveal };
}
