import { getLocale, t } from '../i18n'
import { customerWrite } from '../utils/launch-mode'
import { constructionMessage, customerActionAvailable, getLaunchSnapshot, receiveLaunchStatus, showLaunchNotice } from './launch-mode'
import type { LaunchStatus } from '../utils/launch-mode'
import Taro from '@tarojs/taro'
import type { Runtime } from '../types'
import { newId, subscriptionIds, message } from '../utils/booking'
import { CustomerSession, LoginRequiredError, loginReturnTarget, prepareSession } from '../utils/session'
export { LoginRequiredError } from '../utils/session'

const base = API_BASE_URL.replace(/\/$/, '')
export const isWeapp = process.env.TARO_ENV === 'weapp'
const pending = new Map<string, Promise<unknown>>()
const cooldown = new Map<string, number>()
let sessionPrepared = false
let loginNavigation: Promise<unknown> | undefined
const sessionStorage = {
  get: (key: string) => Taro.getStorageSync(key),
  set: (key: string, value: string) => Taro.setStorageSync(key, value),
  remove: (key: string) => Taro.removeStorageSync(key),
}
const sessionEvent = 'yht-customer-session'
const session = new CustomerSession(sessionStorage, () => Taro.eventCenter.trigger(sessionEvent))

function customerToken(): string {
  if (!sessionPrepared) {
    prepareSession(sessionStorage, base, ENABLE_DEV_LOGIN)
    sessionPrepared = true
  }
  return session.token()
}

export const hasCustomerSession = () => !!customerToken()
export function watchCustomerSession(listener: () => void): () => void {
  Taro.eventCenter.on(sessionEvent, listener)
  return () => { Taro.eventCenter.off(sessionEvent, listener) }
}
export function logout() { session.clear(); pending.clear() }
export const cancelCustomerLogin = () => session.cancelPending()
export function openCustomerLogin(returnTo?: string): Promise<unknown> {
  if (!customerActionAvailable()) return Promise.resolve()
  if (loginNavigation) return loginNavigation
  const pages = Taro.getCurrentPages(), current = pages[pages.length - 1]
  const route = current?.route?.replace(/^\//, '')
  if (route === 'pages/login/index') return Promise.resolve()
  const options = current?.options || {}
  const query = Object.entries(options).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&')
  const target = loginReturnTarget(returnTo || (route ? `/${route}${query ? '?' + query : ''}` : ''))
  const navigation = Taro.navigateTo({ url: `/pages/login/index?returnTo=${encodeURIComponent(target)}` })
  loginNavigation = navigation
  void navigation.then(() => { loginNavigation = undefined }, () => { loginNavigation = undefined })
  return navigation
}
type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; data?: object; headers?: Record<string, string> }

export function request<T>(path: string, options: Options = {}): Promise<T> {
  if (customerWrite(options.method || 'GET', path) && !customerActionAvailable()) return Promise.reject(new Error(constructionMessage()))
  const token = customerToken()
  const privateRequest = path.startsWith('/api/me/') || (path === '/api/appointments' && options.method === 'POST')
  if (privateRequest && !token) return Promise.reject(new LoginRequiredError())
  const key = `${token}|${path}|${JSON.stringify(options.data || {})}`
  const read = !options.method || options.method === 'GET'
  if (read && pending.has(key)) return pending.get(key) as Promise<T>
  if ((cooldown.get(path) || 0) > Date.now()) return Promise.reject(new Error(t('当前访问较多，请稍后重试。')))
  const task = Taro.request<T & { message?: string; code?: string; launchStatus?: LaunchStatus }>({
    url: base + path, method: options.method || 'GET', data: options.data, timeout: 15000,
    header: { 'content-type': 'application/json', 'Accept-Language': getLocale(), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  }).then(result => {
    if (privateRequest && token !== customerToken()) throw new LoginRequiredError(t('登录状态已更新，请重新操作。'))
    if (result.statusCode >= 200 && result.statusCode < 300) return result.data as T
    if (result.statusCode === 423 && result.data?.code === 'MINIPROGRAM_UNDER_CONSTRUCTION') {
      if (result.data.launchStatus) receiveLaunchStatus(result.data.launchStatus)
      void showLaunchNotice()
      throw new Error(result.data.message || constructionMessage())
    }
    if (result.statusCode === 401) {
      session.clear(token)
      throw new LoginRequiredError(t('登录已失效，请重新登录。'))
    }
    if ([429, 503].includes(result.statusCode)) {
      if (cooldown.size > 200) cooldown.clear()
      const seconds = Number(result.header['Retry-After'] || result.header['retry-after']) || 3
      cooldown.set(path, Date.now() + Math.min(60, Math.max(2, seconds)) * 1000)
    }
    throw new Error(result.data?.message || t('操作未完成，请稍后重试。'))
  }, () => { throw new Error(t('暂时无法连接门店服务，请检查网络后重试。')) })
  if (read) { pending.set(key, task); task.then(() => pending.delete(key), () => pending.delete(key)) }
  return task
}

export function login(): Promise<void> {
  return customerToken() ? Promise.resolve() : Promise.reject(new LoginRequiredError())
}

export function authorizeCustomerLogin(agreed: boolean): Promise<void> {
  if (!customerActionAvailable()) return Promise.reject(new Error(constructionMessage()))
  customerToken()
  return session.authorize(agreed, async () => {
    let result: { token: string }
    if (ENABLE_DEV_LOGIN) {
      const runtime = await request<{ developmentLogin?: boolean }>('/api/runtime')
      if (!runtime.developmentLogin) throw new Error(t('当前环境禁止模拟登录。'))
      let deviceId = Taro.getStorageSync<string>('yht-device')
      if (!deviceId) { deviceId = newId(); Taro.setStorageSync('yht-device', deviceId) }
      result = await request('/api/auth/dev-customer', { method: 'POST', data: { deviceId } })
    } else {
      if (!isWeapp) throw new Error(t('请在微信小程序内登录后办理预约；H5 可浏览门店与项目。'))
      const { code } = await Taro.login({ timeout: 10000 })
      if (!code) throw new Error(t('微信登录未完成，请重试。'))
      result = await request('/api/auth/wechat', { method: 'POST', data: { code } })
    }
    return result
  })
}

export function media<T>(value: T): T {
  if (typeof value === 'string' && /^\/(media|uploads)\//.test(value)) return (base + value) as T
  if (Array.isArray(value)) return value.map(media) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, media(v)])) as T
  return value
}
export const toastError = (error: unknown) => { void Taro.showToast({ title: t(message(error)), icon: 'none', duration: 3500 }) }
export const contact = (storeId = '', channel?: 'wechat') => customerActionAvailable() ? Taro.navigateTo({ url: `/pages/chat/index?storeId=${encodeURIComponent(storeId)}${channel === 'wechat' ? '&channel=wechat' : ''}` }) : Promise.resolve()
export function call(phone?: string) { if (!customerActionAvailable()) return; if (phone) void Taro.makePhoneCall({ phoneNumber: phone }); else toastError(new Error(t('门店电话待完善，请使用在线客服。'))) }
export function privacy(): Promise<void> {
  if (!isWeapp || !Taro.getPrivacySetting || !Taro.requirePrivacyAuthorize) return Promise.resolve()
  return new Promise((resolve, reject) => {
    Taro.getPrivacySetting({ success: result => {
      if (!result.needAuthorization) resolve()
      else Taro.requirePrivacyAuthorize({ success: () => resolve(), fail: reject })
    }, fail: reject })
  })
}
// The customer must already be signed in. Call directly in the click handler,
// before any awaited work, to preserve the native subscription user gesture.
// Declining a one-time subscription must never prevent a booking.
export type SubscriptionResult = { accepted: number; recorded: number; declined: number; error?: string }
export type SubscriptionSettings = { enabled: boolean; choices: Record<string, string> }

// A remembered choice is not a new one-time allowance. Settings APIs never write grants.
function subscriptionSettings(open: boolean): Promise<SubscriptionSettings | null> {
  if (!isWeapp) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const options = { withSubscriptions: true, success: (result: {subscriptionsSetting?: {mainSwitch?: boolean; itemSettings?: Record<string, string>}}) => {
      const settings = result.subscriptionsSetting
      resolve(settings ? { enabled: settings.mainSwitch !== false, choices: settings.itemSettings || {} } : null)
    }, fail: () => open ? reject(new Error(t('暂时无法打开微信订阅设置，请在手机微信中重试。'))) : resolve(null) }
    try {
      const operation = open ? Taro.openSetting(options) : Taro.getSetting(options)
      void operation?.catch(options.fail)
    } catch { if (open) reject(new Error(t('当前环境不支持微信订阅设置，请在手机微信中重试。'))); else resolve(null) }
  })
}
export const readSubscriptionSettings = () => subscriptionSettings(false)
// Invoke in the button handler before any awaited work, just like requestSubscribeMessage.
export const openSubscriptionSettings = () => subscriptionSettings(true)
// Run from the booking/changes submit gesture, before awaiting privacy or HTTP.
export function subscribeBooking(runtime: Runtime): Promise<SubscriptionResult> {
  if (getLaunchSnapshot().status?.enabled) return Promise.resolve({ accepted: 0, recorded: 0, declined: 0 })
  return subscribe([runtime.customerTemplateId || '', runtime.customerReminderTemplateId || '', ...(runtime.customerTemplateIds || [])])
}
let subscriptionPromise: Promise<SubscriptionResult> | undefined
export function subscribe(templates?: string | string[]): Promise<SubscriptionResult> {
  if (subscriptionPromise) return subscriptionPromise
  const ids = subscriptionIds(templates)
  if (!isWeapp || !ids.length) return Promise.resolve({ accepted: 0, recorded: 0, declined: 0 })
  if (!hasCustomerSession()) return Promise.resolve({ accepted: 0, recorded: 0, declined: 0, error: t('请先登录，再订阅预约提醒。') })
  const subscriberToken = customerToken()
  const requestId = newId()
  subscriptionPromise = new Promise<SubscriptionResult>(resolve => {
    const fail = (result: {errMsg?: string}) => resolve({ accepted: 0, recorded: 0, declined: ids.length, error: result.errMsg?.includes('cancel') ? undefined : t('订阅未开启，请检查微信消息设置后再试。') })
    try {
      // Taro's cross-platform type also requires Alipay's entityIds; WeChat ignores it.
      const operation = Taro.requestSubscribeMessage({ tmplIds: ids, entityIds: [], success: async result => {
        const accepted = ids.filter(id => result[id] === 'accept')
        let recorded = 0
        try {
          if (accepted.length) {
            if (customerToken() !== subscriberToken) throw new LoginRequiredError(t('登录状态已更新，请重新订阅。'))
            await login()
            const records = await Promise.allSettled(accepted.map(templateId => request<{recorded: boolean}>('/api/me/subscriptions', { method: 'POST', data: { templateId, accepted: true, requestId } })))
            recorded = records.filter(record => record.status === 'fulfilled' && record.value.recorded).length
          }
          const error = recorded < accepted.length ? t('微信授权已完成，但提醒记录未全部保存，请检查网络后重新订阅。') : ids.some(id => result[id] === 'ban' || result[id] === 'filter') ? t('部分提醒模板暂不可用，已保存其余同意的提醒。') : undefined
          if (error) toastError(error)
          resolve({ accepted: accepted.length, recorded, declined: ids.length - accepted.length, error })
        } catch (error) {
          const detail = message(error); toastError(error)
          resolve({ accepted: accepted.length, recorded, declined: ids.length - accepted.length, error: detail })
        }
      }, fail })
      void operation?.catch(fail)
    } catch { resolve({ accepted: 0, recorded: 0, declined: ids.length, error: t('当前环境暂不支持订阅消息，请在手机微信中尝试。') }) }
  })
  void subscriptionPromise.finally(() => { subscriptionPromise = undefined })
  return subscriptionPromise
}
