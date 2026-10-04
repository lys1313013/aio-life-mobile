// 目录只整理服务端返回的授权菜单，不凭空补齐入口。
export const QUICK_NAV_MAX = 12;
const nativePages = {
  "/time/dashboard": "/pages/time/dashboard",
  "/record/feedback": "/pages/records/feedback",
  "/my-hub/feedback": "/pages/records/feedback",
  "/record/device": "/pages/goods/devices",
  "/my-hub/device": "/pages/goods/devices",
  "/record/movie": "/pages/records/library?kind=movie",
  "/my-hub/movie": "/pages/records/library?kind=movie",
  "/record/read": "/pages/records/library?kind=read",
  "/my-hub/read-record": "/pages/records/library?kind=read",
  "/record/exercise": "/pages/records/exercise",
  "/my-hub/exercise": "/pages/records/exercise",
  "/my-hub/exercise/category-config": "/pages/records/categories",
  "/record/performance": "/pages/records/activity",
  "/my-hub/performance": "/pages/records/activity",
  "/record/videoWatch": "/pages/records/video",
  "/my-hub/videoWatch": "/pages/records/video",
  "/record/weread": "/pages/records/weread",
  "/my-hub/weread": "/pages/records/weread",
  "/wardrobe": "/pages/goods/wardrobe",
  "/task/todo": "/pages/tasks/todo",
  "/task-center/todo": "/pages/tasks/todo",
  "/task/goal": "/pages/tasks/goals",
  "/task-center/goal": "/pages/tasks/goals",
  "/finance/dashboard": "/pages/finance/index",
  "/finance/income": "/pages/finance/income",
  "/finance/expense": "/pages/finance/expense",
  "/finance/import": "/pages/finance/import",
  "/finance/bank-cards": "/pages/finance/cards",
  "/finance-management/dashboard": "/pages/finance/index",
  "/finance-management/income": "/pages/finance/income",
  "/finance-management/expense": "/pages/finance/expense",
  "/finance-management/import": "/pages/finance/import",
  "/finance-management/bank-cards": "/pages/finance/cards",
  "/time/my-categories": "/pages/categories/index",
  "/time/category-admin": "/pages/categories/index?admin=1",
  "/mcp/tools": "/pages/mcp/index",
  "/relationship": "/pages/relationship/index",
  "/relationship/graph": "/pages/relationship/index",
  "/password-manager": "/pages/vault/index",
  "/record/password": "/pages/vault/index",
  "/passwordP": "/pages/vault/index",
  "/message": "/pages/messages/index",
  "/record/think": "/pages/records/notes?kind=think",
  "/record/memo": "/pages/records/notes?kind=memo",
  "/record/anniversary": "/pages/records/anniversary",
  "/record/milestone": "/pages/records/milestones",
  "/record/honor": "/pages/records/honor",
  "/my-hub/think": "/pages/records/notes?kind=think",
  "/my-hub/memo": "/pages/records/notes?kind=memo",
  "/my-hub/anniversary": "/pages/records/anniversary",
  "/my-hub/milestone": "/pages/records/milestones",
  "/my-hub/honor": "/pages/records/honor",
  "/system/user": "/pages/admin/index?kind=users",
  "/system/menu": "/pages/admin/index?kind=menus",
  "/system/user-dict": "/pages/admin/index?kind=user-dict",
  "/system/feedback": "/pages/admin/index?kind=feedback",
  "/system/config": "/pages/admin/index?kind=config",
  "/system/membership-providers": "/pages/admin/membership-providers",
  "/system/bank-card-covers": "/pages/admin/bank-card-covers",
  "/system/storage": "/pages/admin/storage",
  "/system/operation-log": "/pages/admin/index?kind=operation",
  "/system/access-log": "/pages/admin/index?kind=access",
  "/config-management/sysDictType": "/pages/admin/index?kind=dict-types",
  "/config-management/sysDictData": "/pages/admin/index?kind=dict-data",
  "/coding/github": "/pages/coding/github",
  "/coding/leetcode": "/pages/coding/leetcode",
  "/coding/csdn": "/pages/coding/csdn",
  "/membership": "/pages/member/index",
  "/vben-admin/about": "/pages/about/index"
}

export function nativeDestination(path) {
  if (nativePages[path]) return nativePages[path]
  if (["/time/time-tracker", "/time/timeTracker"].includes(path))
    return "/pages/time/index";
  if (["/analytics", "/workspace"].includes(path)) return "/pages/home/index";
  if (path === "/profile") return "/pages/profile/index";
  return "";
}

// 编辑/详情参数不改变所属菜单；kind、admin 等页面模式仍需精确匹配。
export function matchesNativeMenu(url, path) {
  const destination = nativeDestination(path);
  if (!destination) return false;
  const [page, query = ''] = url.split('?');
  const [target, required = ''] = destination.split('?');
  if (page !== target) return false;
  const values = query.split('&');
  return !required || required.split('&').every((value) => values.includes(value));
}

export function isBusinessDestination(url) {
  return [...Object.keys(nativePages), '/time/time-tracker']
    .some((path) => matchesNativeMenu(url, path));
}

export function lockedMenuPaths(url, menus, lockedIds) {
  if (!Array.isArray(menus) || !Array.isArray(lockedIds) || lockedIds.some((id) => typeof id !== 'string'))
    throw new Error('菜单锁数据异常，请重试');
  const ids = new Set(lockedIds);
  const paths = new Set();
  function visit(nodes, inherited = false) {
    for (const node of nodes) {
      const locked = inherited || ids.has(node.meta?.menuId);
      if (locked && matchesNativeMenu(url, node.path)) paths.add(node.path);
      if (node.children?.length) visit(node.children, locked);
    }
  }
  visit(menus);
  return [...paths];
}

// 叶子入口由候选接口补充路由，名称、父子关系和顺序均以菜单树为准。
export function buildCatalog(candidates, preferences) {
  const invalid = () => { throw new Error("功能目录数据异常，请重试"); };
  if (!Array.isArray(candidates) || !preferences ||
      !Array.isArray(preferences.menus) || !Array.isArray(preferences.hiddenMenuIds)) invalid();
  const byId = new Map();
  for (const item of candidates) {
    if (!item || typeof item.menuId !== "string" || !item.menuId ||
        typeof item.path !== "string" || typeof item.title !== "string") invalid();
    if (!byId.has(item.menuId)) byId.set(item.menuId, item);
  }
  const hidden = new Set(preferences.hiddenMenuIds);
  const seen = new Set();
  const result = [];
  function visit(nodes, ancestors = []) {
    for (const node of nodes) {
      if (!node || typeof node.id !== "string" || !node.id ||
          typeof node.title !== "string" ||
          (node.children != null && !Array.isArray(node.children))) invalid();
      if (hidden.has(node.id) || seen.has(node.id)) continue;
      seen.add(node.id);
      if (node.children?.length) {
        visit(node.children, [...ancestors, { menuId: node.id, title: node.title }]);
        continue;
      }
      const item = byId.get(node.id);
      if (!item || !item.path.startsWith("/") || item.path.startsWith("//") ||
          /[\\\s?#]/.test(item.path)) continue;
      // 移动端例外：首页由底栏进入，关于统一放在“我的”。
      // 菜单路径可由管理端调整，不能只依赖初始数据中的 /analytics。
      const destination = nativeDestination(item.path);
      if (["/pages/home/index", "/pages/about/index"].includes(destination) ||
          ["首页", "主页", "关于"].includes(node.title.trim())) continue;
      result.push({
        ...item,
        title: node.title,
        ancestors,
        parentTitle: ancestors.map((parent) => parent.title).join(" / "),
        icon: item.icon || "lucide:layout-dashboard",
        color: item.color || "",
        native: !!destination,
      });
    }
  }
  visit(preferences.menus);
  return result;
}

export function catalogSections(catalog, query = "") {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const roots = [];
  const groups = new Map();
  for (const item of catalog) {
    if (!words.every((word) =>
      (item.title + " " + (item.parentTitle || "")).toLowerCase().includes(word))) continue;
    let siblings = roots;
    // 搜索结果直达叶子；平时完整保留服务端配置的子菜单层级。
    const ancestors = words.length ? item.ancestors.slice(0, 1) : item.ancestors;
    for (const parent of ancestors) {
      let group = groups.get(parent.menuId);
      if (!group) {
        group = { ...parent, icon: "lucide:folder", color: "", children: [] };
        groups.set(parent.menuId, group);
        siblings.push(group);
      }
      siblings = group.children;
    }
    siblings.push(item);
  }
  const sections = [];
  for (const root of roots) {
    if (root.children) {
      sections.push({ menuId: root.menuId, title: root.title, items: root.children });
    } else {
      // 顶层叶子不附加自定义组名，且保留它在树中的位置。
      const previous = sections[sections.length - 1];
      if (previous && !previous.title) previous.items.push(root);
      else sections.push({ menuId: root.menuId, title: "", items: [root] });
    }
  }
  return sections;
}

export function readQuickLinks(data) {
  if (
    !Array.isArray(data) ||
    data.length > QUICK_NAV_MAX ||
    data.some(
      (item) =>
        !item ||
        typeof item.menuId !== "string" ||
        !item.menuId ||
        ![0, 1].includes(item.enabled),
    )
  )
    throw new Error("常用功能数据异常，请重试");
  return [...data].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function visibleQuickLinks(saved, catalog) {
  return saved
    .filter((item) => item.enabled === 1)
    .flatMap((item) => {
      const entry = catalog.find(
        (candidate) => candidate.menuId === item.menuId,
      );
      return entry ? [entry] : [];
    });
}

export function quickLinkPayload(items) {
  if (items.length > QUICK_NAV_MAX) throw new Error("常用功能最多 12 项");
  if (new Set(items.map((item) => item.menuId)).size !== items.length)
    throw new Error("常用功能不能重复");
  return items.map((item, index) => ({
    menuId: item.menuId,
    enabled: item.enabled,
    sortOrder: index,
  }));
}
