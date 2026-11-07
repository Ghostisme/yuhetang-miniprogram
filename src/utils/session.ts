interface SessionStorage {
  get(key: string): unknown
  set(key: string, value: string): void
  remove(key: string): void
}

// A simulator keeps its storage when switching builds. Local identities must
// never be reused against production, even when both builds use the same AppID.
export function prepareSession(storage: SessionStorage, apiBase: string, developmentLogin: boolean): void {
  const context = `${apiBase.replace(/\/$/, '')}|${developmentLogin ? 'development' : 'wechat'}`
  if (storage.get('yht-session-context') === context) return
  storage.remove('yht-token')
  storage.set('yht-session-context', context)
}
