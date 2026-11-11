import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import { t, useI18n } from '../i18n'
import { useMemberWallet } from '../hooks/useMemberWallet'
import './MemberBalanceSummary.scss'

export default function MemberBalanceSummary({ phoneVerified }: { phoneVerified: boolean }) {
  const { locale } = useI18n()
  const { lookup, loading, error, fetchedAt, refresh } = useMemberWallet(phoneVerified)
  const known = !!lookup?.accounts.length
  const total = lookup?.accounts.reduce((sum, account) => sum + account.balanceFen, 0)
  const title = !phoneVerified ? '授权手机号后查看会员余额' : !lookup ? error ? '余额暂未加载' : '正在查询余额…' : known ? lookup?.balanceScope === 'LOCAL_AND_SOURCE_CARDS' ? '已关联会员卡合计' : '已迁入账户合计' : lookup.lookupStatus === 'MEMBERSHIP_PENDING' ? '会员资料待核实' : '余额待迁移核对'
  return <View className='member-balance-summary'>
    <View className='balance-summary-heading'><Text>{t('会员余额')}</Text><Text className='balance-summary-status'>{t(title)}</Text></View>
    {known && <View className='balance-summary-amount'>¥{((total || 0) / 100).toFixed(2)}</View>}
    {phoneVerified && <View className='balance-summary-note'>{error ? t(known ? '余额暂未更新，当前显示上次查询结果。' : error) : known ? t('进入页面自动更新，停留时每 15 秒刷新。') : lookup ? t('尚未迁入的账户不计为零余额，请联系门店核对。') : ''}</View>}
    {fetchedAt > 0 && <View className='balance-summary-time'>{t('查询于 {time}', { time: new Date(fetchedAt).toLocaleTimeString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-GB') })}</View>}
    <View className='balance-summary-actions'>
      {phoneVerified && <Button className='balance-summary-refresh' disabled={loading} onClick={() => { void refresh() }}>{t(loading ? '查询中…' : '刷新余额')}</Button>}
      <Button className='balance-summary-detail' onClick={() => { void Taro.navigateTo({ url: '/pages/wallet/index' }) }}>{t('查看余额与明细')}<Text>›</Text></Button>
      <Button className='balance-summary-detail balance-summary-consumption' onClick={() => { void Taro.navigateTo({ url: '/pages/consumption/index' }) }}>{t('消费记录')}<Text>›</Text></Button>
    </View>
  </View>
}
