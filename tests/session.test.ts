import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareSession } from '../src/utils/session'

function storage() {
  const data = new Map<string, string>([['yht-device', 'customer-device'], ['unrelated-setting', 'preserve']])
  return { data, get: (key: string) => data.get(key), set: (key: string, value: string) => { data.set(key, value) }, remove: (key: string) => { data.delete(key) } }
}

test('moving a simulator from local to production discards only its previous login', () => {
  const store = storage()
  prepareSession(store, 'http://127.0.0.1:8790', true)
  store.set('yht-token', 'local-customer-token')
  prepareSession(store, 'https://mp-admin.hetuonian.cn', false)
  assert.equal(store.get('yht-token'), undefined)
  assert.equal(store.get('yht-device'), 'customer-device')
  assert.equal(store.get('unrelated-setting'), 'preserve')
  store.set('yht-token', 'real-wechat-token')
  prepareSession(store, 'https://mp-admin.hetuonian.cn/', false)
  assert.equal(store.get('yht-token'), 'real-wechat-token')
})

test('changing login mode on the same server invalidates a simulated identity', () => {
  const store = storage()
  prepareSession(store, 'http://127.0.0.1:8790', true)
  store.set('yht-token', 'simulated-customer-token')
  prepareSession(store, 'http://127.0.0.1:8790', false)
  assert.equal(store.get('yht-token'), undefined)
})

test('a token from an older build without an environment marker requires a fresh login', () => {
  const store = storage()
  store.set('yht-token', 'legacy-token')
  prepareSession(store, 'https://mp-admin.hetuonian.cn', false)
  assert.equal(store.get('yht-token'), undefined)
})
