export interface SessionStorage {
  get(key: string): unknown
  set(key: string, value: string): void
  remove(key: string): void
}

export const LOGIN_CONSENT_VERSION = '2026-11-08'

function hasLoginConsent(storage: SessionStorage): boolean {
  try { return JSON.parse(String(storage.get('yht-login-consent'))).version === LOGIN_CONSENT_VERSION }
  catch { return false }
}

// A simulator keeps its storage when switching builds. Local identities must
// never be reused against production, even when both builds use the same AppID.
export function prepareSession(storage: SessionStorage, apiBase: string, developmentLogin: boolean): void {
  const context = `${apiBase.replace(/\/$/, '')}|${developmentLogin ? 'development' : 'wechat'}`
  if (storage.get('yht-session-context') === context && hasLoginConsent(storage)) return
  storage.remove('yht-token')
  storage.remove('yht-login-consent')
  storage.set('yht-session-context', context)
}

export class LoginRequiredError extends Error {
  constructor(message = '请先登录，再继续办理。') { super(message); this.name = 'LoginRequiredError' }
}

// The exchange is supplied by the platform layer. Reading a session never starts
// wx.login; only an explicit, consented button press can create a new session.
export class CustomerSession {
  private revision = 0
  private pending?: Promise<void>
  constructor(private storage: SessionStorage, private changed: () => void = () => {}) {}

  token(): string { const value = this.storage.get('yht-token'); return typeof value === 'string' ? value : '' }

  cancelPending(): void { this.revision++; this.pending = undefined }

  clear(expectedToken?: string): boolean {
    if (expectedToken !== undefined && (!expectedToken || this.token() !== expectedToken)) return false
    this.cancelPending()
    this.storage.remove('yht-token')
    this.changed()
    return true
  }

  authorize(agreed: boolean, exchange: () => Promise<{ token: string }>): Promise<void> {
    if (!agreed) return Promise.reject(new Error('请先阅读并同意用户协议与隐私说明。'))
    if (this.pending) return this.pending
    const revision = this.revision
    const task = (async () => {
      const result = await exchange()
      if (revision !== this.revision) throw new LoginRequiredError('本次登录已取消，请重新操作。')
      if (typeof result?.token !== 'string' || !result.token.trim()) throw new Error('登录凭证未返回，请重试。')
      this.storage.set('yht-token', result.token)
      this.storage.set('yht-login-consent', JSON.stringify({ version: LOGIN_CONSENT_VERSION, acceptedAt: new Date().toISOString() }))
      this.changed()
    })()
    this.pending = task
    void task.then(() => { if (this.pending === task) this.pending = undefined }, () => { if (this.pending === task) this.pending = undefined })
    return task
  }
}

const pages = ['home', 'catalog', 'stores', 'contact', 'orders', 'booking', 'chat', 'store-detail', 'profile']
export function loginReturnTarget(value?: string): string {
  if (!value || value.length > 1500 || /[\r\n#\\]/.test(value)) return '/pages/orders/index'
  const path = value.split('?')[0]
  return pages.some(page => path === `/pages/${page}/index`) ? value : '/pages/orders/index'
}
export function isTabPage(value: string): boolean {
  return ['home', 'catalog', 'stores', 'contact', 'orders'].some(page => value.split('?')[0] === `/pages/${page}/index`)
}
