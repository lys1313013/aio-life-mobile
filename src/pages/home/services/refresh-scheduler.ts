// 前台数据调度与返回时效共用时间点；不依赖浏览器或 uni API。
export const homeSectionRefreshSeconds: Record<string, number> = {
  time: 300, exercise: 600, watched: 1800, thoughts: 3600, commits: 3600,
}

export function refreshIntervalMs(seconds: unknown) {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    && seconds * 1000 <= 2147483647 ? seconds * 1000 : 0
}

export function createHomeRefreshScheduler(clock = {
  now: () => Date.now(),
  set: (callback: () => void, delay: number) => setTimeout(callback, delay),
  cancel: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}) {
  type Task = { interval: number; run: () => unknown; at: number; timer: ReturnType<typeof setTimeout> | null; running: boolean; version: number }
  const tasks = new Map<string, Task>()
  let active = false

  function stop(task: Task) {
    if (task.timer != null) clock.cancel(task.timer)
    task.timer = null
  }
  function schedule(task: Task) {
    stop(task)
    if (!active || task.running) return
    const version = task.version
    task.timer = clock.set(() => {
      task.timer = null
      if (!active || task.version !== version) return
      task.running = true
      // Promise 包装同时处理同步异常与异步失败，失败后仍按周期重试。
      void Promise.resolve().then(task.run).catch(() => {}).finally(() => {
        if (task.version !== version) return
        task.running = false
        task.at = clock.now()
        schedule(task)
      })
    }, Math.max(0, task.at + task.interval - clock.now()))
  }
  function set(key: string, seconds: unknown, run: () => unknown) {
    const interval = refreshIntervalMs(seconds), previous = tasks.get(key)
    if (!interval) {
      if (previous) { stop(previous); previous.version++; tasks.delete(key) }
      return
    }
    const task = previous || { interval, run, at: clock.now(), timer: null, running: false, version: 0 }
    task.interval = interval; task.run = run
    tasks.set(key, task)
    schedule(task)
  }
  function settled(key: string) {
    const task = tasks.get(key)
    if (task) { task.at = clock.now(); schedule(task) }
  }
  function pause() {
    active = false
    for (const task of tasks.values()) { stop(task); task.version++; task.running = false }
  }
  return {
    set, settled, pause,
    due: (key: string) => { const task = tasks.get(key); return !!task && clock.now() >= task.at + task.interval },
    resume: () => { active = true; for (const task of tasks.values()) schedule(task) },
    clear: () => { pause(); tasks.clear() },
  }
}
