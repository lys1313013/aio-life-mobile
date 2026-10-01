import { webLink } from "./dashboard-format.ts";
import { nativeDestination } from "./life-catalog.ts";

let quickNavEditorRequested = false;

export function openQuickNavEditor() {
  quickNavEditorRequested = true;
  uni.switchTab({
    url: "/pages/life/index",
    fail: () => { quickNavEditorRequested = false; },
  });
}
export function takeQuickNavEditorRequest() {
  const requested = quickNavEditorRequested;
  quickNavEditorRequested = false;
  return requested;
}
export function openBusinessLink(path: string) {
  const native = nativeDestination(path);
  if (native) {
    if (['/pages/home/index', '/pages/time/index', '/pages/life/index', '/pages/profile/index'].includes(native)) uni.switchTab({ url: native });
    else uni.navigateTo({ url: native });
    return;
  }
  const url = webLink(path);
  if (!url) {
    uni.showToast({ title: "暂不支持此链接", icon: "none" });
    return;
  }
  // 只传递页面地址，网页版自行校验登录、权限与二级锁。
  // #ifdef WEB
  window.open(url, "_blank", "noopener,noreferrer");
  // #endif
  // #ifndef WEB
  uni.showModal({
    title: "在网页版继续",
    content:
      "该功能目前在网页版提供，复制链接后可在浏览器打开。网页版需单独登录。",
    confirmText: "复制链接",
    success: (result) => {
      if (result.confirm) uni.setClipboardData({ data: url });
    },
  });
  // #endif
}
