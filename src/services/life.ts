import { request } from "./api.ts";
import {
  buildCatalog,
  quickLinkPayload,
  readQuickLinks,
} from "./life-catalog.ts";

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
