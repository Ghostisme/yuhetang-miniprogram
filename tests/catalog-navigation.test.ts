import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

type Node = { type: string; props: Record<string, any> }

// Execute the real page with WeChat's hide/show lifecycle. H5's image overlay
// alone cannot reproduce the native preview page returning through onShow.
function fixture() {
  const state: unknown[] = [], catalogState = { tab: 'services' }
  const previews: { current: string; urls: string[] }[] = []
  let cursor = 0, show = () => {}, tree: Node
  const site = {
    brandName: '裕和堂', brandEnglish: 'YU Health', tagline: '自在有和', brandStory: '品牌介绍',
    hero: { image: '/brand.jpg' }, contact: { message: '欢迎咨询' },
    services: [{ id: 'care', name: '测试养护', enabled: true, image: '/care.jpg', steps: [] }],
    products: [{ id: 'product', name: '测试好物', enabled: true, image: '/product.jpg' }],
    galleryGroups: [{ id: 'space', name: '茶室空间', images: ['/space-1.jpg', '/space-2.jpg', '/space-3.jpg'] }],
  }
  const jsx = (type: string, props: Record<string, any>) => ({ type, props })
  const sdk = { previewImage: async (options: { current: string; urls: string[] }) => { previews.push(options) } }
  const require = (name: string) => {
    if (name === 'react') return { useState: (initial: unknown) => {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], (value: unknown) => { state[index] = value }]
    } }
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
    if (name === '@tarojs/taro') return { __esModule: true, default: sdk, useDidShow: (fn: () => void) => { show = fn } }
    if (name === '@tarojs/components') return { Button: 'Button', Image: 'Image', Text: 'Text', View: 'View' }
    if (name.endsWith('/hooks/useSite')) return { useSite: () => ({ site, error: '', refresh: async () => {} }) }
    if (name.endsWith('/services/site')) return { catalogState, themeStyle: () => ({}) }
    if (name.endsWith('/components/PageState')) return { default: 'PageState' }
    if (name.endsWith('.scss')) return {}
    throw new Error('Unexpected page import: ' + name)
  }
  const module = { exports: {} as { default?: () => Node } }
  const source = ts.transpileModule(readFileSync('src/pages/catalog/index.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(source, { module, exports: module.exports, require })
  function render() { cursor = 0; tree = module.exports.default!(); return tree }
  function collect(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(collect)
    if (!value || typeof value !== 'object' || !('props' in value)) return []
    const node = value as Node
    return [node, ...collect(node.props.children)]
  }
  function nodes() { return collect(tree) }
  function clickTab(label: string) {
    const button = nodes().find(node => node.type === 'Button' && node.props.children === label)
    assert(button, label + ' tab exists'); button.props.onClick(); render()
  }
  function showPage() { show(); render() }
  function activeTab() { return nodes().find(node => node.type === 'Button' && node.props.className === 'active')?.props.children }
  render(); showPage()
  return { catalogState, previews, render, nodes, clickTab, showPage, activeTab }
}

test('closing native space-image preview retains the selected gallery and image list', async () => {
  const page = fixture()
  page.clickTab('空间美学')
  const image = page.nodes().find(node => node.type === 'Image' && node.props.src === '/space-2.jpg')!
  image.props.onClick()
  await Promise.resolve()
  assert.equal(page.previews[0].current, '/space-2.jpg')
  assert.deepEqual(Array.from(page.previews[0].urls), ['/space-1.jpg', '/space-2.jpg', '/space-3.jpg'])
  // Native image preview hides this page; closing it causes another onShow.
  page.showPage(); page.showPage()
  assert.equal(page.activeTab(), '空间美学')
  assert.equal(page.nodes().filter(node => node.type === 'Image').length, 3)
})

test('ordinary page resumes preserve product, brand and detail selections', () => {
  const page = fixture()
  for (const label of ['东方好物', '关于裕和堂', '特色养护']) {
    page.clickTab(label); page.showPage()
    assert.equal(page.activeTab(), label)
  }
  const card = page.nodes().find(node => node.props.className === 'card catalog-card')!
  card.props.onClick(); page.render(); page.showPage()
  assert(page.nodes().some(node => node.props.className === 'catalog-detail'))
})

test('an explicit homepage entry selects its requested column once and clears old detail', () => {
  const page = fixture()
  const card = page.nodes().find(node => node.props.className === 'card catalog-card')!
  card.props.onClick(); page.render()
  page.catalogState.tab = 'products'; page.showPage()
  assert.equal(page.activeTab(), '东方好物')
  assert(!page.nodes().some(node => node.props.className === 'catalog-detail'))
  page.clickTab('空间美学'); page.showPage()
  assert.equal(page.activeTab(), '空间美学', 'Homepage intent is consumed only once')
  page.catalogState.tab = 'services'; page.showPage()
  assert.equal(page.activeTab(), '特色养护', 'The homepage care shortcut still navigates explicitly')
})
