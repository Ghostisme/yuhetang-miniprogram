import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createLocaleStore, normalizeLocale, translate, localizedField } from '../src/i18n/core'
import { localizeSite, localizeService, localizeTherapist } from '../src/i18n/content'
import type { Site, ServiceItem, Therapist } from '../src/types'

test('Chinese is the default and the website Japanese alias is understood', () => {
  for (const value of [undefined, null, {}, '', 'de']) assert.equal(normalizeLocale(value), null)
  assert.equal(normalizeLocale('zh-CN'), 'zh'); assert.equal(normalizeLocale('en_US'), 'en')
  assert.equal(normalizeLocale('jp'), 'ja'); assert.equal(normalizeLocale(' JA-jp '), 'ja')
  assert.equal(createLocaleStore({ get: () => undefined, set: () => {} }).get(), 'zh')
})

test('language persists independently and notifies mounted pages without replacing their state', () => {
  const storage = new Map<string, unknown>([['locale', 'jp'], ['token', 'unchanged']])
  const store = createLocaleStore({ get: () => storage.get('locale'), set: value => { storage.set('locale', value) } })
  let notifications = 0
  assert.equal(store.get(), 'ja')
  const unsubscribe = store.subscribe(() => notifications++)
  store.set('en'); store.set('en'); assert.equal(store.set('fr'), false)
  assert.equal(notifications, 1); assert.equal(storage.get('locale'), 'en'); assert.equal(storage.get('token'), 'unchanged')
  unsubscribe(); store.set('zh'); assert.equal(notifications, 1)
  assert.equal(createLocaleStore({ get: () => storage.get('locale'), set: () => {} }).get(), 'zh')
})

test('unavailable local storage does not prevent choosing a language for this session', () => {
  const store = createLocaleStore({ get: () => { throw new Error('storage unavailable') }, set: () => { throw new Error('storage full') } })
  assert.equal(store.get(), 'zh'); assert.equal(store.set('ja'), true); assert.equal(store.get(), 'ja')
})

test('interpolation keeps names and numbers literal and unknown copy falls back to its original', () => {
  assert.equal(translate('{count} 人', 'en', { count: 4 }), '4 guests')
  assert.equal(translate('{count} 人', 'ja', { count: 4 }), '4名')
  assert(translate('{name}正在为您接待', 'en', { name: '王老师' }).includes('王老师'))
  assert.equal(translate('门店刚编辑的原始介绍', 'en'), '门店刚编辑的原始介绍')
  assert.equal(translate('客户姓名', 'zh'), '客户姓名')
  assert.equal(translate('', 'ja'), '')
})

test('presentation overrides do not translate service IDs, prices, enablement or customer input', () => {
  const service = { id: 'massage', name: '中医推拿', storeId: 'shanghai', price: 398, enabled: false,
    duration: '60分钟', description: '客户服务价目资料列示项目。具体服务内容和价格请查看所选门店介绍。', steps: [],
    customerName: '中医推拿', remark: '中医推拿', translations: { en: { name: 'Branch-specific massage', id: 'wrong-id', price: 1 } },
  } as unknown as ServiceItem
  const before = structuredClone(service), next = localizeService(service, 'en')
  assert.equal(next.name, 'Branch-specific massage'); assert.equal(next.id, 'massage')
  assert.equal(next.storeId, 'shanghai'); assert.equal(next.enabled, false)
  assert.equal((next as any).price, 398); assert.equal((next as any).customerName, '中医推拿'); assert.equal((next as any).remark, '中医推拿')
  assert.deepEqual(service, before)
  assert.equal(localizedField({ name: '中医推拿', translations: { en: { name: '' } } }, 'name', 'en'), translate('中医推拿', 'en'))
  assert.equal(localizedField({ name: '中医推拿', translations: { jp: { name: '店舗独自の施術' } } }, 'name', 'ja'), '店舗独自の施術')
  assert.deepEqual(localizedField({ steps: ['中医推拿'], translations: { en: { steps: ['Unrelated', 'Extra step'] } } }, 'steps', 'en'), [translate('中医推拿', 'en')])
})

test('store filter identity and gallery images survive localization and Chinese can be restored exactly', () => {
  const site = { brandName: '裕和堂', hero: { title: '一段自在时光' }, contact: {},
    stores: [{ id: 'shanghai', name: '上海中心店', district: '浦东新区', address: '', services: [] }],
    services: [], products: [], sections: [], galleryGroups: [{ id: 'tea', name: '茶室光影', images: ['/one.jpg', '/two.jpg'] }],
  } as unknown as Site
  const before = structuredClone(site)
  for (const locale of ['en', 'ja'] as const) {
    const next = localizeSite(site, locale)
    assert.equal(next.stores[0].name, translate(site.stores[0].name, locale))
    if (locale === 'en') assert.notEqual(next.stores[0].name, site.stores[0].name)
    assert.equal(next.stores[0].district, '浦东新区'); assert.equal(next.stores[0].id, 'shanghai')
    assert.deepEqual(next.galleryGroups[0].images, ['/one.jpg', '/two.jpg'])
    assert.notEqual(next.galleryGroups[0].name, '茶室光影')
  }
  assert.deepEqual(site, before); assert.equal(localizeSite(site, 'zh'), site)
  const person = { id: 't-1', name: '王老师（示例）', storeId: 'shanghai', storeName: '上海中心店', grade: '高级', specialty: '中医推拿', serviceIds: ['massage'], enabled: true } as Therapist
  assert.equal(localizeTherapist(person, 'en').name, '王老师 (Sample)')
  assert.equal(localizeTherapist({ ...person, name: '王女士' }, 'ja').name, '王女士')
})

test('both dictionaries contain complete reviewed translations and preserve all numeric prices', () => {
  for (const file of ['messages', 'content']) {
    const dictionary = JSON.parse(readFileSync(`src/i18n/${file}.json`, 'utf8')) as Record<string, { en: string; ja: string }>
    for (const [source, translations] of Object.entries(dictionary)) {
      for (const language of ['en', 'ja'] as const) {
        assert.equal(typeof translations[language], 'string', `${language}: ${source}`)
        assert(translations[language].trim(), `${language}: ${source}`)
        assert.deepEqual([...translations[language].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...source.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `Placeholders: ${source}`)
        if (source.startsWith('对症调理。参考时长：') || source.includes('参考价格：')) {
          const numbers = (value: string) => [...value.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0])).sort((a, b) => a - b)
          assert.deepEqual(numbers(translations[language]), numbers(source), `Pricing and duration: ${source}`)
        }
      }
    }
  }
})
