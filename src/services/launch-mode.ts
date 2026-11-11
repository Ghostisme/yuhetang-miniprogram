import Taro from '@tarojs/taro'
import { getLocale, t } from '../i18n'
import { launchCopy, type LaunchStatus } from '../utils/launch-mode'

type Snapshot = { ready: boolean; status: LaunchStatus | null }
let snapshot: Snapshot = { ready: false, status: null }
const listeners = new Set<() => void>()
let pending: Promise<void> | undefined, fetchedAt = 0, dialog: Promise<unknown> | undefined
export const getLaunchSnapshot = () => snapshot
export const watchLaunchStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function receiveLaunchStatus(status: LaunchStatus | null) {
  if (JSON.stringify(snapshot) === JSON.stringify({ ready: true, status })) return
  snapshot = { ready: true, status }; listeners.forEach(listener => listener())
}
export function refreshLaunchStatus(force = false): Promise<void> {
  if (pending) return pending
  if (!force && fetchedAt && Date.now() - fetchedAt < 1000) return Promise.resolve()
  pending = Taro.request<LaunchStatus>({ url: API_BASE_URL.replace(/\/$/, '') + '/api/launch-status', timeout: 10000,
    header: { 'Accept-Language': getLocale(), 'Cache-Control': 'no-cache' },
  }).then(result => {
    if (result.statusCode === 404) { receiveLaunchStatus(null); fetchedAt = Date.now(); return } // Deploy Java first; preserve compatibility with earlier servers.
    if (result.statusCode !== 200 || typeof result.data?.enabled !== 'boolean' || !result.data.title || !result.data.message) throw new Error('Invalid launch configuration')
    receiveLaunchStatus(result.data); fetchedAt = Date.now()
  }).finally(() => { pending = undefined })
  return pending
}
export function showLaunchNotice() {
  const status = snapshot.status
  if (!status?.enabled || dialog) return dialog
  const copy = launchCopy(status, getLocale())
  dialog = Taro.showModal({ title: copy.title, content: copy.message, showCancel: false, confirmText: t('我知道了') })
  void dialog.then(() => { dialog = undefined }, () => { dialog = undefined })
  return dialog
}
export const constructionMessage = () => snapshot.status ? launchCopy(snapshot.status, getLocale()).message : t('小程序正在建设中，暂仅供浏览。')
export function customerActionAvailable() {
  if (!snapshot.status?.enabled) return true
  void showLaunchNotice(); return false
}
