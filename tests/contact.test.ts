import { i18nFixture } from './fixtures/i18n'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { canContactCustomerService } from '../src/utils/chat-access'
import type { CustomerProfile } from '../src/types'

// Render actual channel button props, including their async eligibility/native-entry transition.
function fixture(platform = 'weapp', ready = true, construction = false) {
  const calls: unknown[] = [], slots: any[] = [], effects: (() => void)[] = [], context = { storeId: '' }
  const access = { ready, checking: false, profile: ready ? { phone: '13900003001' } : null }
  let cursor = 0
  const jsx = (type: unknown, props: unknown) => ({ type, props }), module = { exports: {} as any }
  const require = (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useState: (initial: unknown) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: unknown) => { slots[i] = value }] },
      useRef: (initial: unknown) => { const i = cursor++; return slots[i] ||= { current: initial } },
      useEffect: (fn: () => (() => void), deps: unknown[]) => {
        const i = cursor++, previous = slots[i]
        if (!previous || deps.some((value, j) => value !== previous.deps[j])) {
          previous?.cleanup?.(); const next = { deps, cleanup: undefined as unknown }; slots[i] = next
          effects.push(() => { next.cleanup = fn() })
        }
      },
    }
    if (name === '@tarojs/taro') return { useDidHide: () => {} }
    if (name === '@tarojs/components') return { Button: 'Button', Image: 'Image', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }
    if (name === '../../services/api') return {
      isWeapp: platform === 'weapp',
      contact: async (id: string, channel?: string) => { calls.push(channel ? ['native-login', id, channel] : ['online', id]) },
      call: (phone: string) => calls.push(['phone', phone]),
      request: async (_path: string, options: any) => { calls.push(['entry', options.data.storeId]); return { sessionFrom: 'opaque-' + (options.data.storeId || 'hq') } },
    }
    if (name === '../../hooks/useCustomerChatAccess') return { useCustomerChatAccess: () => access }
    if (name === '../../hooks/useLaunchStatus') return { useLaunchStatus: () => ({ready:true,status:{enabled:construction}}) }
    if (name === '../../services/launch-mode') return { customerActionAvailable: () => !construction }
    if (name === '../../services/site') return { contactState: context }
    if (name === '../../utils/booking') return { message: (e: Error) => e.message }
    if (name.endsWith('.scss') || name.endsWith('.png')) return name
    if (name.endsWith('/i18n')) return i18nFixture
    throw new Error('Unexpected contact fixture import: ' + name)
  }
  const source = ts.transpileModule(readFileSync('src/components/CustomerService/index.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require })
  const site = { stores: [{ id: 'shanghai', enabled: true, phone: '021-50181919' }, { id: 'retired', enabled: false, phone: '00000000' }], contact: { phone: '021-60000000' } }
  function buttons(node: any): any[] {
    if (Array.isArray(node)) return node.flatMap(buttons)
    if (!node || typeof node !== 'object') return []
    return [...(node.type === 'Button' ? [node.props] : []), ...buttons(node.props?.children)]
  }
  function render(props: Record<string, unknown> = {}) {
    cursor = 0; const result = buttons(module.exports.ContactChannels({ site, ...props }))
    while (effects.length) effects.shift()!()
    return result
  }
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  return { render, calls, context, access, flush }
}

test('construction mode never exposes a native contact button or prepares a WeChat session entry',async()=>{
  const f=fixture('weapp',true,true)
  f.render({storeId:'shanghai'});await f.flush()
  const buttons=f.render({storeId:'shanghai'})
  assert.equal(buttons.some(b=>b.openType==='contact'),false)
  buttons.find(b=>b.className.includes('contact-channel-wechat')).onClick();await f.flush()
  assert.deepEqual(f.calls,[])
})

test('native contact is enabled only after verified eligibility and a server-issued entry; rendering never creates a conversation', async () => {
  const f = fixture(), props = { storeId: 'shanghai' }
  let buttons = f.render(props)
  assert.equal(buttons.find(b => b.className.includes('contact-channel-wechat')).openType, undefined)
  await f.flush(); buttons = f.render(props)
  const native = buttons.find(button => button.openType === 'contact')
  assert.equal(native.sessionFrom, 'opaque-shanghai')
  assert.equal(buttons.filter(button => button.openType === 'contact').length, 1)
  assert.deepEqual(f.calls, [['entry', 'shanghai']])
})

test('guest or incomplete profile cannot open native chat and is guided through login/profile with store and channel preserved', async () => {
  const f = fixture('weapp', false), buttons = f.render({ storeId: 'shanghai' })
  assert.equal(buttons.some(b => b.openType === 'contact'), false)
  assert.deepEqual(f.calls, [])
  buttons.find(b => b.className.includes('contact-channel-wechat')).onClick(); await f.flush()
  assert.deepEqual(f.calls, [['native-login', 'shanghai', 'wechat']])
  buttons.find(b => b.className === 'contact-phone').onClick()
  assert.deepEqual(f.calls[1], ['phone', '021-50181919'])
  f.access.ready = true; f.access.profile = { phone: '13900003001' }
  f.render({ storeId: 'shanghai' }); await f.flush()
  assert.equal(f.render({ storeId: 'shanghai' }).find(b => b.openType === 'contact').sessionFrom, 'opaque-shanghai')
  f.access.ready = false; f.access.profile = null
  assert.equal(f.render({ storeId: 'shanghai' }).some(b => b.openType === 'contact'), false, 'Logout immediately removes native access')
})

test('explicit online and telephone actions retain the selected branch', async () => {
  const f = fixture('h5'); let closed = 0
  const buttons = f.render({ storeId: 'shanghai', onNavigate: () => { closed++ } })
  buttons.find(b => b.className.includes('contact-channel-online')).onClick(); await f.flush()
  assert.deepEqual(f.calls, [['online', 'shanghai']]); assert.equal(closed, 1); assert.equal(f.context.storeId, 'shanghai')
  buttons.find(b => b.className === 'contact-phone').onClick()
  assert.deepEqual(f.calls[1], ['phone', '021-50181919'])
})

test('disabled or removed stores fall back to headquarters without trusting a stale branch', async () => {
  for (const storeId of ['retired', 'missing']) {
    const f = fixture(); f.render({ storeId }); await f.flush()
    const buttons = f.render({ storeId })
    assert.equal(buttons.find(b => b.openType === 'contact').sessionFrom, 'opaque-hq')
    buttons.find(b => b.className === 'contact-phone').onClick()
    assert.deepEqual(f.calls, [['entry', ''], ['phone', '021-60000000']])
  }
})

test('H5 never exposes native WeChat contact or requests native entries; chat menu cannot open itself', () => {
  const f = fixture('h5'), buttons = f.render({ showOnline: false })
  assert.equal(buttons.some(b => b.openType === 'contact'), false)
  assert.equal(buttons.some(b => b.className.includes('contact-channel-online')), false)
  assert.deepEqual(f.calls, [])
})

test('name-only, unverified phone and incomplete consent states are all insufficient for customer chat', () => {
  const valid = { name: '陈女士', phone: '13900003001', phoneVerified: true, complete: true } as CustomerProfile
  assert.equal(canContactCustomerService(valid), true)
  for (const value of [null, { ...valid, name: '  ' }, { ...valid, phone: '' }, { ...valid, phoneVerified: false }, { ...valid, complete: false }]) assert.equal(canContactCustomerService(value), false)
})
