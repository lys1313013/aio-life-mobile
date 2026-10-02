// 几何约束：状态栏不可覆盖，导航控件至少 44px，微信胶囊按实际位置避让。
export function navigationLayout(windowInfo, capsule, spacing) {
  const statusBarHeight = Math.max(0, windowInfo.statusBarHeight || 0);
  const windowWidth = windowInfo.windowWidth || 375;
  const validCapsule = capsule && capsule.height > 0 && capsule.width > 0
    && capsule.top >= statusBarHeight && capsule.left > spacing.page
    && capsule.right <= windowWidth;
  const navigationHeight = validCapsule
    ? Math.max(spacing.controlMin, capsule.height + (capsule.top - statusBarHeight) * 2)
    : 48;
  // API 尚未返回有效尺寸时也保留常规胶囊宽度，避免控件进入系统点击区。
  const rightInset = capsule
    ? (validCapsule ? windowWidth - capsule.left + spacing.inline : 96 + spacing.inline)
    : spacing.page;
  return { statusBarHeight, navigationHeight, rightInset };
}
