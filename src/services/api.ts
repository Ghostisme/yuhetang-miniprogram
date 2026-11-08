import Taro from '@tarojs/taro'
import { newId, subscriptionIds, message } from '../utils/booking'
import { prepareSession } from '../utils/session'

const base = API_BASE_URL.replace(/\/$/, '')
export const isWeapp = process.env.TARO_ENV === 'weapp'
const pending = new Map<string, Promise<unknown>>()
const cooldown = new Map<string, number>()
let loginPromise: Promise<void> | undefined
let sessionPrepared = false

function customerToken(): string {
  if (!sessionPrepared) {
    prepareSession({
      get: key => Taro.getStorageSync(key),
      set: (key, value) => Taro.setStorageSync(key, value),
      remove: key => Taro.removeStorageSync(key),
    }, base, ENABLE_DEV_LOGIN)
    sessionPrepared = true
  }
  return Taro.getStorageSync<string>('yht-token')
}
type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; data?: object; headers?: Record<string, string> }

export function request<T>(path: string, options: Options = {}): Promise<T> {
  const token = customerToken()
  const key = `${token}|${path}|${JSON.stringify(options.data || {})}`
  const read = !options.method || options.method === 'GET'
  if (read && pending.has(key)) return pending.get(key) as Promise<T>
  if ((cooldown.get(path) || 0) > Date.now()) return Promise.reject(new Error('当前访问较多，请稍后重试。'))
  const task = Taro.request<T & { message?: string }>({
    url: base + path, method: options.method || 'GET', data: options.data, timeout: 15000,
    header: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  }).then(result => {
    if (result.statusCode >= 200 && result.statusCode < 300) return result.data as T
    if (result.statusCode === 401) Taro.removeStorageSync('yht-token')
    if ([429, 503].includes(result.statusCode)) {
      if (cooldown.size > 200) cooldown.clear()
      const seconds = Number(result.header['Retry-After'] || result.header['retry-after']) || 3
      cooldown.set(path, Date.now() + Math.min(60, Math.max(2, seconds)) * 1000)
    }
    throw new Error(result.data?.message || '操作未完成，请稍后重试。')
  }, () => { throw new Error('暂时无法连接门店服务，请检查网络后重试。') })
  if (read) { pending.set(key, task); task.then(() => pending.delete(key), () => pending.delete(key)) }
  return task
}

export async function login(): Promise<void> {
  if (customerToken()) return
  if (loginPromise) return loginPromise
  loginPromise = (async () => {
    let result: { token: string }
    if (ENABLE_DEV_LOGIN) {
      const runtime = await request<{ developmentLogin?: boolean }>('/api/runtime')
      if (!runtime.developmentLogin) throw new Error('当前环境禁止模拟登录。')
      let deviceId = Taro.getStorageSync<string>('yht-device')
      if (!deviceId) { deviceId = newId(); Taro.setStorageSync('yht-device', deviceId) }
      result = await request('/api/auth/dev-customer', { method: 'POST', data: { deviceId } })
    } else {
      if (!isWeapp) throw new Error('请在微信小程序内登录后办理预约；H5 可浏览门店与项目。')
      const { code } = await Taro.login()
      if (!code) throw new Error('微信登录未完成，请重试。')
      result = await request('/api/auth/wechat', { method: 'POST', data: { code } })
    }
    Taro.setStorageSync('yht-token', result.token)
  })()
  try { await loginPromise } finally { loginPromise = undefined }
}

export function media<T>(value: T): T {
  if (typeof value === 'string' && /^\/(media|uploads)\//.test(value)) return (base + value) as T
  if (Array.isArray(value)) return value.map(media) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, media(v)])) as T
  return value
}
export const toastError = (error: unknown) => { void Taro.showToast({ title: message(error), icon: 'none', duration: 3500 }) }
export const contact = (storeId = '') => Taro.navigateTo({ url: `/pages/chat/index?storeId=${encodeURIComponent(storeId)}` })
export function call(phone?: string) { if (phone) void Taro.makePhoneCall({ phoneNumber: phone }); else toastError(new Error('门店电话待完善，请使用在线客服。')) }
export function privacy(): Promise<void> {
  if (!isWeapp || !Taro.getPrivacySetting || !Taro.requirePrivacyAuthorize) return Promise.resolve()
  return new Promise((resolve, reject) => {
    Taro.getPrivacySetting({ success: result => {
      if (!result.needAuthorization) resolve()
      else Taro.requirePrivacyAuthorize({ success: () => resolve(), fail: reject })
    }, fail: reject })
  })
}
// Call directly in the user click handler, before login or any other awaited work.
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
    }, fail: () => open ? reject(new Error('暂时无法打开微信订阅设置，请在手机微信中重试。')) : resolve(null) }
    try {
      const operation = open ? Taro.openSetting(options) : Taro.getSetting(options)
      void operation?.catch(options.fail)
    } catch { if (open) reject(new Error('当前环境不支持微信订阅设置，请在手机微信中重试。')); else resolve(null) }
  })
}
export const readSubscriptionSettings = () => subscriptionSettings(false)
// Invoke in the button handler before any awaited work, just like requestSubscribeMessage.
export const openSubscriptionSettings = () => subscriptionSettings(true)
let subscriptionPromise: Promise<SubscriptionResult> | undefined
export function subscribe(templates?: string | string[]): Promise<SubscriptionResult> {
  if (subscriptionPromise) return subscriptionPromise
  const ids = subscriptionIds(templates)
  if (!isWeapp || !ids.length) return Promise.resolve({ accepted: 0, recorded: 0, declined: 0 })
  const requestId = newId()
  subscriptionPromise = new Promise<SubscriptionResult>(resolve => {
    const fail = (result: {errMsg?: string}) => resolve({ accepted: 0, recorded: 0, declined: ids.length, error: result.errMsg?.includes('cancel') ? undefined : '订阅未开启，请检查微信消息设置后再试。' })
    try {
      // Taro's cross-platform type also requires Alipay's entityIds; WeChat ignores it.
      const operation = Taro.requestSubscribeMessage({ tmplIds: ids, entityIds: [], success: async result => {
        const accepted = ids.filter(id => result[id] === 'accept')
        let recorded = 0
        try {
          if (accepted.length) {
            await login()
            const records = await Promise.allSettled(accepted.map(templateId => request<{recorded: boolean}>('/api/me/subscriptions', { method: 'POST', data: { templateId, accepted: true, requestId } })))
            recorded = records.filter(record => record.status === 'fulfilled' && record.value.recorded).length
          }
          const error = recorded < accepted.length ? '微信授权已完成，但提醒记录未全部保存，请检查网络后重新订阅。' : ids.some(id => result[id] === 'ban' || result[id] === 'filter') ? '部分提醒模板暂不可用，已保存其余同意的提醒。' : undefined
          if (error) toastError(error)
          resolve({ accepted: accepted.length, recorded, declined: ids.length - accepted.length, error })
        } catch (error) {
          const detail = message(error); toastError(error)
          resolve({ accepted: accepted.length, recorded, declined: ids.length - accepted.length, error: detail })
        }
      }, fail })
      void operation?.catch(fail)
    } catch { resolve({ accepted: 0, recorded: 0, declined: ids.length, error: '当前环境暂不支持订阅消息，请在手机微信中尝试。' }) }
  })
  void subscriptionPromise.finally(() => { subscriptionPromise = undefined })
  return subscriptionPromise
}
