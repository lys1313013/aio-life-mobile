// 原生 tabBar 不在页面的层叠上下文中；页面弹层打开期间暂时收起。
const tabRoutes = ['pages/home/index', 'pages/time/index', 'pages/life/index', 'pages/profile/index']
let count = 0
let hidden = false
let updating = false

function syncTabBar() {
  const nextHidden = count > 0
  if (updating || nextHidden === hidden) return
  updating = true
  const options = {
    animation: false,
    success: () => {
      hidden = nextHidden
      updating = false
      // hide/show 回调到达前可能已经关闭或重开弹层，按最新状态继续同步。
      syncTabBar()
    },
    fail: () => { updating = false },
  }
  if (nextHidden) uni.hideTabBar(options)
  else uni.showTabBar(options)
}

export function registerModalTabBar() {
  const pages = getCurrentPages()
  const page = pages[pages.length - 1]
  // 独立编辑路由和业务分包没有 tabBar，不调用原生隐藏接口。
  if (!page || !tabRoutes.includes(page.route || '')) return () => {}
  count++
  syncTabBar()
  let released = false
  return () => {
    if (released) return
    released = true
    count--
    syncTabBar()
  }
}
