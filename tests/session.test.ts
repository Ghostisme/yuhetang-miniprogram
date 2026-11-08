import assert from 'node:assert/strict'
import test from 'node:test'
import { CustomerSession, LOGIN_CONSENT_VERSION, LoginRequiredError, isTabPage, loginReturnTarget, prepareSession } from '../src/utils/session'

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
  store.set('yht-login-consent', JSON.stringify({ version: LOGIN_CONSENT_VERSION }))
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

test('upgrading from silent login requires one explicit consent even on the same server', () => {
  const store = storage()
  store.set('yht-session-context', 'https://mp-admin.hetuonian.cn|wechat')
  store.set('yht-token', 'old-silent-session')
  prepareSession(store, 'https://mp-admin.hetuonian.cn', false)
  assert.equal(store.get('yht-token'), undefined)
  store.set('yht-token', 'consented-session')
  store.set('yht-login-consent', JSON.stringify({ version: LOGIN_CONSENT_VERSION }))
  prepareSession(store, 'https://mp-admin.hetuonian.cn', false)
  assert.equal(store.get('yht-token'), 'consented-session')
})

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('guest session reads and rejected consent never start a WeChat exchange', async () => {
  const store = storage(), session = new CustomerSession(store)
  let exchanges = 0
  assert.equal(session.token(), '')
  await assert.rejects(session.authorize(false, async () => { exchanges++; return { token: 'should-not-exist' } }), /用户协议/)
  assert.equal(exchanges, 0)
  assert.equal(store.get('yht-login-consent'), undefined)
})

test('a consented login is single flight and records the actual successful consent', async () => {
  const store = storage(), result = deferred<{token: string}>()
  let changes = 0, exchanges = 0
  const session = new CustomerSession(store, () => { changes++ })
  const exchange = () => { exchanges++; return result.promise }
  const first = session.authorize(true, exchange), second = session.authorize(true, exchange)
  assert.equal(exchanges, 1); assert.equal(session.token(), '')
  result.resolve({ token: 'wechat-customer-session' }); await Promise.all([first, second])
  assert.equal(session.token(), 'wechat-customer-session'); assert.equal(changes, 1)
  assert.equal(JSON.parse(String(store.get('yht-login-consent'))).version, LOGIN_CONSENT_VERSION)
})

test('denied or empty WeChat login creates no session and permits an explicit retry', async () => {
  const store = storage(), session = new CustomerSession(store)
  await assert.rejects(session.authorize(true, async () => { throw new Error('微信登录未完成') }), /未完成/)
  await assert.rejects(session.authorize(true, async () => ({ token: '' })), /凭证未返回/)
  assert.equal(session.token(), ''); assert.equal(store.get('yht-login-consent'), undefined)
  await session.authorize(true, async () => ({ token: 'fresh-token' }))
  assert.equal(session.token(), 'fresh-token')
})

test('leaving the login page prevents a late exchange from silently signing in', async () => {
  const store = storage(), session = new CustomerSession(store), result = deferred<{token: string}>()
  const attempt = session.authorize(true, () => result.promise)
  session.cancelPending(); result.resolve({ token: 'cancelled-token' })
  await assert.rejects(attempt, LoginRequiredError)
  assert.equal(session.token(), '')
  await session.authorize(true, async () => ({ token: 'new-intent-token' }))
  session.cancelPending()
  assert.equal(session.token(), 'new-intent-token', 'unloading after a successful login must retain it')
})

test('a delayed 401 for an old token cannot log out a newer customer session', async () => {
  const store = storage(), session = new CustomerSession(store)
  await session.authorize(true, async () => ({ token: 'old-token' }))
  await session.authorize(true, async () => ({ token: 'new-token' }))
  assert.equal(session.clear('old-token'), false)
  assert.equal(session.clear(''), false)
  assert.equal(session.token(), 'new-token')
  assert.equal(session.clear('new-token'), true)
  assert.equal(session.token(), '')
})

test('logout invalidates an in-flight login without changing other device settings', async () => {
  const store = storage(), session = new CustomerSession(store), result = deferred<{token: string}>()
  const attempt = session.authorize(true, () => result.promise)
  session.clear(); result.resolve({ token: 'late-token' })
  await assert.rejects(attempt, LoginRequiredError)
  assert.equal(store.get('yht-device'), 'customer-device')
  assert.equal(store.get('unrelated-setting'), 'preserve')
})

test('login returns only to known application pages and retains store selection', () => {
  const store = '/pages/booking/index?storeId=shanghai&serviceId=care-1'
  assert.equal(loginReturnTarget(store), store)
  for (const unsafe of ['https://example.com', '//example.com', '/pages/login/index', '/pages/legal/index', '/pages/orders/index#x', '/pages/booking/index\\evil', '/pages/chat/index\nx']) {
    assert.equal(loginReturnTarget(unsafe), '/pages/orders/index')
  }
  assert.equal(isTabPage('/pages/orders/index'), true)
  assert.equal(isTabPage(loginReturnTarget('/pages/contact/index')), true)
  assert.equal(isTabPage('/pages/booking/index?storeId=shanghai'), false)
})
