export type LaunchLocale = 'zh' | 'en' | 'ja'
export type LaunchStatus = {
  enabled: boolean; revision: number; updatedAt: string
  title: Record<LaunchLocale, string>; message: Record<LaunchLocale, string>
}

export function customerWrite(method: string, path: string) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false
  const pathname = path.split('?')[0]
  return pathname === '/api/appointments' || pathname.startsWith('/api/appointments/') || pathname === '/api/me' || pathname.startsWith('/api/me/') || pathname.startsWith('/api/auth/')
}

export function launchCopy(status: LaunchStatus, locale: LaunchLocale) {
  return { title: status.title[locale] || status.title.zh, message: status.message[locale] || status.message.zh }
}

// Track a notice across tab switches, but show new announcements and new activations.
export function createLaunchNoticeMemory() {
  let last = ''
  return (status: LaunchStatus, locale: LaunchLocale) => {
    if (!status.enabled) { last = ''; return false }
    const key = JSON.stringify([status.revision, locale, status.title, status.message])
    if (key === last) return false
    last = key; return true
  }
}
