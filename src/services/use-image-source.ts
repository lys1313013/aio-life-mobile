import { onUnmounted, ref, watch } from 'vue';
import { authFileUrl } from './attachments.ts';
import { session } from './session.ts';

/** Shared authenticated-image lifecycle; business aspect ratios and server generation states stay in the caller. */
export function useImageSource(input: () => { fileId?: string; url?: string }, reset?: () => void) {
  const source = ref(''), loading = ref(false), failed = ref(false);
  let generation = 0;
  function release(url: string) {
    // #ifdef WEB
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    // #endif
  }
  async function load() {
    const revision = ++generation;
    release(source.value); source.value = ''; failed.value = false; reset?.();
    const { fileId, url } = input();
    loading.value = !!(fileId || url) && (!fileId || !!session.token);
    if (!loading.value) return;
    try {
      const resolved = fileId ? await authFileUrl(fileId) : url!;
      if (revision !== generation) { release(resolved); return; }
      source.value = resolved;
    } catch { if (revision === generation) { loading.value = false; failed.value = true; } }
  }
  function imageLoad() { loading.value = false; }
  function imageError() { loading.value = false; failed.value = true; }
  watch(() => [input().fileId, input().url, session.token], load, { immediate: true });
  onUnmounted(() => { generation++; release(source.value); });
  return { source, loading, failed, load, imageLoad, imageError };
}
