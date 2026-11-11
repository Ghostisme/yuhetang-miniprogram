import { useEffect, useRef, type ComponentType } from 'react'
import { useDidHide, useDidShow, useUnload } from '@tarojs/taro'
import { Button, Text } from '@tarojs/components'
import { useI18n } from '../../i18n'
import { useLaunchStatus } from '../../hooks/useLaunchStatus'
import { refreshLaunchStatus, showLaunchNotice } from '../../services/launch-mode'
import { createLaunchNoticeMemory } from '../../utils/launch-mode'
import './index.scss'

const shouldAnnounce = createLaunchNoticeMemory()
function LaunchNotice() {
  const { locale, t } = useI18n(), { status } = useLaunchStatus()
  const timer = useRef<ReturnType<typeof setInterval>>()
  function stop() { clearInterval(timer.current); timer.current = undefined }
  function start() { stop(); void refreshLaunchStatus(true).catch(() => {}); timer.current = setInterval(() => { void refreshLaunchStatus(true).catch(() => {}) }, 15000) }
  useDidShow(start); useDidHide(stop); useUnload(stop)
  useEffect(() => {
    start()
    const visible = () => { if (document.visibilityState === 'hidden') stop(); else start() }
    if (process.env.TARO_ENV === 'h5') document.addEventListener('visibilitychange', visible)
    return () => { stop(); if (process.env.TARO_ENV === 'h5') document.removeEventListener('visibilitychange', visible) }
  }, [])
  useEffect(() => {
    if (status && shouldAnnounce(status, locale)) void showLaunchNotice()
  }, [status, locale])
  if (!status?.enabled) return null
  return <Button className={`launch-notice locale-${locale}`} ariaLabel={t('查看建设中提示')} onClick={() => { void showLaunchNotice() }}><Text className='launch-notice-dot' /><Text>{t('建设中 · 仅供浏览')}</Text><Text>›</Text></Button>
}

// A WeChat App cannot render page UI. Each native page owns this shared notice.
export function withLaunchNotice(Page: ComponentType) {
  return function LaunchAwarePage() { return <><Page /><LaunchNotice /></> }
}
