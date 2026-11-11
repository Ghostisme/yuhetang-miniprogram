import { useEffect, useSyncExternalStore } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { createLocaleStore, languageNames, locales, LOCALE_STORAGE_KEY, translate, type Locale } from './core'
export { languageNames, locales, type Locale } from './core'

const store = createLocaleStore({ get: () => Taro.getStorageSync(LOCALE_STORAGE_KEY), set: locale => Taro.setStorageSync(LOCALE_STORAGE_KEY, locale) })
export const getLocale = store.get
export const setLocale = store.set
export const t = (text: string | null | undefined, values?: Record<string, string | number>) => translate(text, getLocale(), values)
const tabTitles = ['首页', '养护', '门店', '客服', '我的预约']
const titles: Record<string, string> = { home: '裕和堂', catalog: '养护', stores: '门店', contact: '客服', orders: '我的预约', booking: '预约到店', chat: '在线咨询', 'store-detail': '门店详情', login: '登录', legal: '用户协议', profile: '个人资料', wallet: '会员余额', consumption: '消费记录' }
let tabLocale: Locale | undefined, navigationKey = ''

export function refreshNavigation(locale: Locale = getLocale()) {
  if (tabLocale !== locale) {
    tabLocale = locale
    tabTitles.forEach((title, index) => { void Taro.setTabBarItem({ index, text: translate(title, locale) }).catch(() => { tabLocale = undefined }) })
  }
  const page = Taro.getCurrentPages().slice(-1)[0]
  const name = page?.route?.replace(/^\//, '').split('/')[1]
  if (name && titles[name]) {
    const title = name === 'legal' && page.options?.kind === 'privacy' ? '隐私说明' : titles[name]
    const key = `${page.route}:${title}:${locale}`
    if (navigationKey !== key) {
      navigationKey = key
      void Taro.setNavigationBarTitle({ title: translate(title, locale) }).catch(() => { navigationKey = '' })
    }
  }
  if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale
}

// Native WeChat modal button labels are short; the dialog title explains the action.
export function dialogLabels(confirm = '确认') {
  const locale = getLocale()
  return {
    confirmText: locale === 'zh' ? confirm : locale === 'ja' ? '確認' : 'OK',
    cancelText: locale === 'zh' ? '取消' : locale === 'ja' ? '戻る' : 'Back',
  }
}

export function useI18n() {
  const locale = useSyncExternalStore(store.subscribe, store.get, store.get)
  useEffect(() => { refreshNavigation(locale) }, [locale])
  useDidShow(() => { refreshNavigation() })
  return { locale, t, setLocale, languageName: languageNames[locale] }
}

export async function chooseLanguage() {
  try {
    const result = await Taro.showActionSheet({ itemList: locales.map(locale => languageNames[locale]) })
    if (locales[result.tapIndex]) setLocale(locales[result.tapIndex])
  } catch { /* Dismissing the native selector keeps the current page and language. */ }
}
