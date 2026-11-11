/** Physical pixels: a custom page reserves the WeChat status/capsule area once. */
export function navigationInset(statusBarHeight = 20, capsule?: { top: number; bottom: number; height: number }) {
  const status = Number.isFinite(statusBarHeight) && statusBarHeight >= 0 ? statusBarHeight : 20
  if (capsule && capsule.height > 0 && capsule.top >= status && capsule.bottom > capsule.top && capsule.bottom < status + 100) return capsule.bottom + 8
  return status + 44
}
