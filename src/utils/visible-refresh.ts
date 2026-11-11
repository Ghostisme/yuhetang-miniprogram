/** Refresh only while a page is visible; ignore replies from a previous visit/session. */
export function createVisibleRefresh<T>(options: {
  read: () => Promise<T>
  receive: (value: T) => void
  fail: (error: unknown) => void
  interval?: number
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
}) {
  const schedule = options.schedule || setTimeout, cancel = options.cancel || clearTimeout
  let visible = false, generation = 0, pending: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  function clearTimer() { if (timer !== undefined) cancel(timer); timer = undefined }
  function refresh(): Promise<void> {
    if (!visible) return Promise.resolve()
    if (pending) return pending
    clearTimer()
    const visit = generation
    const operation = Promise.resolve().then(() => {
      if (visible && visit === generation) return options.read()
    }).then(value => {
      if (visible && visit === generation) options.receive(value as T)
    }, error => {
      if (visible && visit === generation) options.fail(error)
    }).finally(() => {
      if (pending === operation) pending = undefined
      if (visible && visit === generation) timer = schedule(() => { timer = undefined; void refresh() }, options.interval ?? 15_000)
    })
    pending = operation
    return operation
  }
  return {
    refresh,
    start() { if (!visible) { visible = true; generation++ }; return refresh() },
    stop() { visible = false; generation++; pending = undefined; clearTimer() },
  }
}
