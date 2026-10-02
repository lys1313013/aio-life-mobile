import { request } from "./api.ts";
import { watch } from "vue";
import { session } from "./session.ts";
import {
  buildCatalog,
  quickLinkPayload,
  readQuickLinks,
} from "./life-catalog.ts";

// 页面销毁后仍保留本次登录的目录；null 表示尚未加载，空数组也是有效结果。
let catalogSnapshot: any[] | null = null;
watch(() => session.token, () => { catalogSnapshot = null; }, { flush: "sync" });

export function readCachedLifeCatalog() {
  return session.token ? catalogSnapshot : null;
}

export function cacheLifeCatalog(data: any[], token: string) {
  if (token && token === session.token) catalogSnapshot = data;
}

export async function loadLifeCatalog() {
  const [candidates, preferences] = await Promise.all([
    request("/quick-nav/candidates"),
    request("/menu/preferences"),
  ]);
  return buildCatalog(candidates, preferences);
}
export async function loadLifeQuickLinks() {
  return readQuickLinks(await request("/quick-nav/my"));
}
export async function saveLifeQuickLinks(items) {
  return readQuickLinks(
    await request("/quick-nav/my", "POST", { items: quickLinkPayload(items) }),
  );
}
