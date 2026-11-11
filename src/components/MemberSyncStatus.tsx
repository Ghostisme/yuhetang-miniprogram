import { Text, View } from '@tarojs/components'
import { t, useI18n } from '../i18n'

export type MemberSync = { enabled: boolean; state: string; lastSuccess?: string; lastAttempt?: string; stale?: boolean; intervalSeconds?: number; historyComplete?: boolean }
export default function MemberSyncStatus({ sync }: { sync?: MemberSync }) {
  const { locale } = useI18n()
  if (!sync?.enabled) return null
  const state = sync.state === 'LOGIN_REQUIRED' ? '原系统登录已过期，请联系门店恢复同步。' : sync.state === 'ERROR' ? '原系统暂未同步成功，保留上次核对的数据。' : sync.state === 'NO_MATCH' ? '原系统暂未匹配到已验证手机号，请联系门店核对。' : sync.state === 'SYNCING' || !sync.lastSuccess ? '正在等待后台同步会员卡与消费记录。' : sync.stale ? '数据更新有延迟，当前显示上次同步结果。' : '会员卡与消费记录由后台定时同步。'
  return <View className='member-sync-status'><Text>{t(state)}</Text>{sync.lastSuccess && <Text className='member-sync-time'>{t('源数据更新于 {time}', { time: new Date(sync.lastSuccess).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-GB', { timeZone: 'Asia/Shanghai', hour12: false }) })}</Text>}{sync.lastSuccess && sync.historyComplete === false && <Text>{t('历史消费仍在补充，未显示不代表没有消费。')}</Text>}</View>
}
