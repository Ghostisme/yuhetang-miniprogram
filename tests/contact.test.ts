import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Check the real component's native button contract without launching WeChat.
function fixture(platform = 'weapp') {
  const calls: unknown[] = [], state: unknown[] = [], context = { storeId: '' }
  const jsx = (type: unknown, props: unknown) => ({ type, props })
  const module = { exports: {} as any }
  const require = (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return { useState: (value: unknown) => [value, (next: unknown) => state.push(next)] }
    if (name === '@tarojs/taro') return { useDidHide: () => {} }
    if (name === '@tarojs/components') return { Button: 'Button', Image: 'Image', ScrollView: 'ScrollView', Text: 'Text', View: 'View' }
    if (name === '../../services/api') return { isWeapp: platform === 'weapp', contact: async (id: string) => { calls.push(['online', id]) }, call: (phone: string) => calls.push(['phone', phone]) }
    if (name === '../../services/site') return { contactState: context }
    if (name === '../../utils/booking') return { message: (e: Error) => e.message }
    if (name.endsWith('.scss') || name.endsWith('.png')) return name
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
  return { module: module.exports, site, calls, state, context, buttons }
}

test('contact menu keeps WeChat openType and public store attribution without opening a chat on render', () => {
  const f = fixture(), buttons = f.buttons(f.module.ContactChannels({ site: f.site, storeId: 'shanghai' }))
  const native = buttons.find(button => button.openType === 'contact')
  assert.equal(native.sessionFrom, 'yht-store:shanghai')
  assert.equal(buttons.filter(button => button.openType === 'contact').length, 1)
  assert.equal(f.calls.length, 0)
})

test('explicit channel actions use the same branch for online consultation and telephone', async () => {
  const f = fixture(); let closed = 0
  const buttons = f.buttons(f.module.ContactChannels({ site: f.site, storeId: 'shanghai', onNavigate: () => { closed++ } }))
  buttons.find(button => button.className.includes('contact-channel-online')).onClick()
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.deepEqual(f.calls, [['online', 'shanghai']])
  assert.equal(f.context.storeId, 'shanghai'); assert.equal(closed, 1)
  buttons.find(button => button.className === 'contact-phone').onClick()
  assert.deepEqual(f.calls[1], ['phone', '021-50181919'])
})

test('removed or disabled branches fall back to headquarters instead of stale branch routing', () => {
  for (const storeId of ['retired', 'missing']) {
    const f = fixture(), buttons = f.buttons(f.module.ContactChannels({ site: f.site, storeId }))
    assert.equal(buttons.find(button => button.openType === 'contact').sessionFrom, 'yht-store:')
    buttons.find(button => button.className === 'contact-phone').onClick()
    assert.deepEqual(f.calls, [['phone', '021-60000000']])
  }
})

test('H5 exposes online/telephone without pretending to open native WeChat; the chat menu cannot open itself', () => {
  const f = fixture('h5'), center = f.buttons(f.module.ContactChannels({ site: f.site }))
  assert.equal(center.some(button => button.openType === 'contact'), false)
  assert.equal(center.some(button => button.className.includes('contact-channel-online')), true)
  const chat = f.buttons(f.module.ContactChannels({ site: f.site, showOnline: false }))
  assert.equal(chat.some(button => button.className.includes('contact-channel-online')), false)
  assert.equal(f.calls.length, 0)
})
