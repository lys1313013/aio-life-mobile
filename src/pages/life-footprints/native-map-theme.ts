import { nextTick, onScopeDispose, ref, watch } from 'vue';
import { isDark, theme } from '../../services/theme.ts';

/**
 * 微信 3.17.3 基础库将 setting 透传到原生地图，初始化桥接包含 enableDarkMode。
 * 此字段未列入公开 map 文档，属于原生兼容适配，实际底图颜色仍须真机验收。
 */
export function useNativeMapTheme() {
  const setting = ref<{ enableDarkMode?: boolean }>({ enableDarkMode: isDark.value });
  let ready = false;
  let generation = 0;

  async function sync() {
    if (!ready) return;
    const current = ++generation;
    // 空 setting 不改变地图状态。先清除绑定再补发，避免宿主主题变化后，
    // 相同的 enableDarkMode 被 setData 差异检查省略；不重建地图或重置视野。
    setting.value = {};
    await nextTick();
    if (ready && current === generation) setting.value = { enableDarkMode: isDark.value };
  }

  function updated() {
    if (ready) return;
    ready = true;
    // 微信初始化地图时自行写入 enableDarkMode，首次 updated 后补发页面配置。
    void sync();
  }

  // 手动浅色模式下，微信主题变化不会改变 isDark，但仍需要重申地图配置。
  watch([isDark, () => theme.system], sync, { flush: 'post' });
  onScopeDispose(() => { ready = false; generation++; });
  return { setting, updated, sync };
}
