import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { i18nFixture } from './fixtures/i18n'

// Exercise native callbacks against the actual profile component; no customer data or WeChat calls.
function fixture({ requirePhone = true, phoneVerified = false, isWeapp = true } = {}) {
  let profile = { name: '', phone: phoneVerified ? '13900003001' : '', phoneVerified, complete: false, memberVerified: false }
  const slots: any[] = [], effects: (() => void)[] = [], calls: any[] = [], changes: any[] = []
  const jsx = (type: unknown, props: any) => ({ type, props }), module = { exports: {} as any }
  let cursor = 0
  const require = (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useState: (initial: any) => { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (next: any) => { slots[i] = next }] },
      useRef: (initial: any) => { const i = cursor++; return slots[i] ||= { current: initial } },
      useEffect: (fn: () => void) => { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn) } },
    }
    if (name === '@tarojs/taro') return { __esModule: true, default: { showToast: async () => {} }, useDidShow: () => {} }
    if (name === '@tarojs/components') return Object.fromEntries(['Button', 'Checkbox', 'CheckboxGroup', 'Input', 'Label', 'Text', 'View'].map(key => [key, key]))
    if (name === '../services/api') return { isWeapp, hasCustomerSession: () => true, request: async (path: string, options?: any) => {
      calls.push({ path, options })
      if (path.endsWith('/phone')) profile = { ...profile, name: options.data.name, phone: '13900003001', phoneVerified: true, complete: true }
      else if (options?.method === 'PUT') profile = { ...profile, name: options.data.name, complete: profile.phoneVerified }
      return { ...profile }
    } }
    if (name.endsWith('/i18n')) return i18nFixture
    if (name.endsWith('.scss') || name.endsWith('MemberBalanceSummary')) return { default: 'Wallet' }
      if(name==='../hooks/useLaunchStatus')return {useLaunchStatus:()=>({ready:true,status:{enabled:false}})}
      if(name==='../services/launch-mode')return {customerActionAvailable:()=>true}
      throw new Error('Unexpected profile fixture import: ' + name)
  }
  const source = ts.transpileModule(readFileSync('src/components/CustomerProfile.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require })
  function nodes(tree: any): any[] { return Array.isArray(tree) ? tree.flatMap(nodes) : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [] }
  function render() { cursor = 0; const result = module.exports.default({ requirePhone, showWallet: false, onChanged: (value: any) => changes.push(value) }); while (effects.length) effects.shift()!(); return nodes(result) }
  const flush = () => new Promise<void>(resolve => setImmediate(resolve))
  return { render, flush, calls, changes }
}

test('native phone grant cannot be requested or recorded before entering a name and accepting profile use', async () => {
  const f = fixture(); f.render(); await f.flush()
  let nodes = f.render(), phone = nodes.find(n => n.type === 'Button' && n.props.onGetPhoneNumber)
  assert.equal(phone.props.openType, undefined)
  phone.props.onGetPhoneNumber({ detail: { code: 'must-not-be-saved' } }); await f.flush()
  assert.equal(f.calls.some(c => c.options?.method === 'POST'), false)
  nodes.find(n => n.type === 'Input').props.onInput({ detail: { value: '陈女士' } })
  nodes = f.render(); phone = nodes.find(n => n.type === 'Button' && n.props.onGetPhoneNumber)
  assert.equal(phone.props.openType, undefined)
  nodes.find(n => n.type === 'CheckboxGroup').props.onChange({ detail: { value: ['profile'] } })
  assert.equal(f.render().find(n => n.type === 'Button' && n.props.onGetPhoneNumber).props.openType, 'getPhoneNumber')
})

test('denied phone authorization never completes the customer or submits a fabricated phone', async () => {
  const f = fixture(); f.render(); await f.flush()
  const nodes = f.render()
  nodes.find(n => n.type === 'Input').props.onInput({ detail: { value: '陈女士' } })
  nodes.find(n => n.type === 'CheckboxGroup').props.onChange({ detail: { value: ['profile'] } })
  f.render().find(n => n.props.onGetPhoneNumber).props.onGetPhoneNumber({ detail: { errMsg: 'getPhoneNumber:fail user deny' } })
  await f.flush()
  assert.equal(f.calls.some(c => c.options?.method === 'POST'), false)
  assert.equal(f.changes.some(c => c.complete), false)
  assert.match(JSON.stringify(f.render()), /请先授权微信手机号，再开始咨询/)
  assert.doesNotMatch(JSON.stringify(f.render()), /保存称呼|可先保存/)
})

test('accepted native code sends name and consent to the server and unlocks chat only with the verified response', async () => {
  const f = fixture(); f.render(); await f.flush()
  const nodes = f.render()
  nodes.find(n => n.type === 'Input').props.onInput({ detail: { value: '陈女士' } })
  nodes.find(n => n.type === 'CheckboxGroup').props.onChange({ detail: { value: ['profile'] } })
  f.render().find(n => n.props.onGetPhoneNumber).props.onGetPhoneNumber({ detail: { code: 'one-time-phone-code' } })
  assert.equal(f.changes.some(c => c.complete), false)
  await f.flush()
  const writes = f.calls.filter(c => c.options?.method === 'POST')
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/api/me/profile/phone')
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].options.data)), { name: '陈女士', consent: true, code: 'one-time-phone-code' })
  const saved = f.changes[f.changes.length - 1]
  assert.equal(saved.complete, true); assert.equal(saved.phoneVerified, true)
})

test('customer chat has no name-only save or manual phone fallback in native and H5 views', async () => {
  for (const isWeapp of [true, false]) {
    const f = fixture({ isWeapp }); f.render(); await f.flush()
    const nodes = f.render()
    assert.doesNotMatch(JSON.stringify(nodes), /保存称呼|可先保存/)
    assert.equal(nodes.filter(n => n.type === 'Input').length, 1, 'Only the customer name can be typed')
    if (isWeapp) assert.equal(nodes.filter(n => n.type === 'Button' && n.props.onGetPhoneNumber).length, 1)
    else {
      assert.match(JSON.stringify(nodes), /请在手机微信中打开小程序并授权手机号后，再使用客服对话/)
      assert.equal(nodes.filter(n => n.type === 'Button').length, 0)
    }
    assert.equal(f.calls.some(c => c.options), false)
  }
})

test('a previously authorized customer can finish their name and consent without another phone grant', async () => {
  const f = fixture({ phoneVerified: true }); f.render(); await f.flush()
  let nodes = f.render()
  assert.equal(nodes.some(n => n.props.onGetPhoneNumber), false)
  assert.match(JSON.stringify(nodes), /保存资料并开始咨询/)
  nodes.find(n => n.type === 'Button' && n.props.className === 'primary').props.onClick(); await f.flush()
  assert.equal(f.calls.some(c => c.options), false)
  nodes.find(n => n.type === 'Input').props.onInput({ detail: { value: '陈女士' } })
  nodes.find(n => n.type === 'CheckboxGroup').props.onChange({ detail: { value: ['profile'] } })
  nodes = f.render()
  nodes.find(n => n.type === 'Button' && n.props.className === 'primary').props.onClick()
  assert.equal(f.changes.some(c => c.complete), false)
  await f.flush()
  const writes = f.calls.filter(c => c.options)
  assert.equal(writes.length, 1); assert.equal(writes[0].options.method, 'PUT')
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].options.data)), { name: '陈女士', consent: true })
  const saved = f.changes[f.changes.length - 1]
  assert.equal(saved.phone, '13900003001'); assert.equal(saved.complete, true)
})

test('optional profile editing outside chat retains its name-only save without fabricating phone authorization', async () => {
  const f = fixture({ requirePhone: false }); f.render(); await f.flush()
  let nodes = f.render()
  nodes.find(n => n.type === 'Input').props.onInput({ detail: { value: '陈女士' } })
  nodes.find(n => n.type === 'CheckboxGroup').props.onChange({ detail: { value: ['profile'] } })
  nodes = f.render()
  nodes.find(n => n.type === 'Button' && n.props.className === 'secondary').props.onClick(); await f.flush()
  const saved = f.changes[f.changes.length - 1]
  assert.equal(saved.name, '陈女士'); assert.equal(saved.phoneVerified, false)
  assert.equal(saved.complete, false)
})
