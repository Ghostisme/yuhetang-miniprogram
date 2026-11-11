import assert from 'node:assert/strict'
import test from 'node:test'
import { createVisibleRefresh } from '../src/utils/visible-refresh'
const unexpected = (value: unknown) => assert.fail(String(value))

function clock() {
  const tasks = new Map<number, { run: () => void; delay: number }>()
  let next = 0
  return {
    tasks,
    schedule: (run: () => void, delay: number) => { const id = ++next; tasks.set(id, { run, delay }); return id as unknown as ReturnType<typeof setTimeout> },
    cancel: (id: ReturnType<typeof setTimeout>) => { tasks.delete(id as unknown as number) },
    tick: () => { const [id, task] = [...tasks][0]; tasks.delete(id); task.run() },
  }
}
function deferred<T>() {
  let resolve!: (result: T) => void
  const promise = new Promise<T>(yes => { resolve = yes })
  return { promise, resolve }
}

test('balance checks fetch on entry, repeat every 15 seconds and coalesce refresh taps', async () => {
  const timer = clock(), values: number[] = []
  let amount = 392801, calls = 0
  const reader = createVisibleRefresh({ ...timer, read: async () => { calls++; return amount }, receive: value => values.push(value), fail: unexpected })
  const initial = reader.start()
  assert.equal(reader.start(), initial)
  assert.equal(reader.refresh(), initial)
  await initial
  assert.deepEqual(values, [392801]); assert.equal(calls, 1)
  assert.equal([...timer.tasks.values()][0].delay, 15_000)
  amount = 382801; timer.tick(); await reader.refresh()
  assert.deepEqual(values, [392801, 382801]); assert.equal(calls, 2)
  reader.stop(); assert.equal(timer.tasks.size, 0)
  await reader.refresh(); assert.equal(calls, 2)
  amount = 380001; await reader.start()
  assert.deepEqual(values, [392801, 382801, 380001]); assert.equal(calls, 3)
  reader.stop()
})

test('hiding the page ignores a late balance response and schedules no background checks', async () => {
  const timer = clock(), response = deferred<number>(), values: number[] = []
  const reader = createVisibleRefresh({ ...timer, read: () => response.promise, receive: value => values.push(value), fail: unexpected })
  const pending = reader.start(); await Promise.resolve()
  reader.stop(); response.resolve(999); await pending
  assert.deepEqual(values, []); assert.equal(timer.tasks.size, 0)
})

test('a previous customer response cannot replace the new customer balance after reset', async () => {
  const timer = clock(), old = deferred<number>(), current = deferred<number>(), values: number[] = []
  let calls = 0
  const reader = createVisibleRefresh({ ...timer, read: () => ++calls === 1 ? old.promise : current.promise, receive: value => values.push(value), fail: unexpected })
  const first = reader.start(); await Promise.resolve()
  reader.stop(); const second = reader.start(); await Promise.resolve()
  current.resolve(200); await second; old.resolve(9999); await first
  assert.deepEqual(values, [200]); assert.equal(timer.tasks.size, 1)
  reader.stop()
})

test('a failed refresh reports failure without inventing a zero and recovers on the next read', async () => {
  const timer = clock(), values: number[] = [], errors: unknown[] = []
  let online = true
  const reader = createVisibleRefresh({ ...timer, read: async () => { if (!online) throw new Error('offline'); return 392801 }, receive: value => values.push(value), fail: error => errors.push(error) })
  await reader.start(); online = false; timer.tick(); await reader.refresh()
  assert.deepEqual(values, [392801]); assert.equal(errors.length, 1); assert.equal(timer.tasks.size, 1)
  online = true; timer.tick(); await reader.refresh()
  assert.deepEqual(values, [392801, 392801]); reader.stop()
})

test('stopping before the first request begins never performs a financial query', async () => {
  const timer = clock(); let calls = 0
  const reader = createVisibleRefresh({ ...timer, read: async () => { calls++; return 1 }, receive: unexpected, fail: unexpected })
  const pending = reader.start(); reader.stop(); await pending
  assert.equal(calls, 0); assert.equal(timer.tasks.size, 0)
})
