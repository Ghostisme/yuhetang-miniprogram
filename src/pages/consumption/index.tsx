import { withLaunchNotice } from '../../components/LaunchNotice'
import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow } from '@tarojs/taro'
import { Button, Picker, ScrollView, Text, View } from '@tarojs/components'
import { useI18n, t } from '../../i18n'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import OptionSelect from '../../components/OptionSelect'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import { useConsumptionRecords, type ConsumptionRecord } from '../../hooks/useConsumptionRecords'
import { request } from '../../services/api'
import type { CustomerProfile } from '../../types'
import MemberSyncStatus from '../../components/MemberSyncStatus'
import './index.scss'

const money = (fen: number) => '¥' + (fen / 100).toFixed(2)
const states = { RECORDED: '已登记', REVERSED: '已冲正', VOIDED: '已作废' }

function ConsumptionPage() {
  const { locale } = useI18n(), signedIn = useCustomerSession()
  const [profile, setProfile] = useState<CustomerProfile | null>(null), [profileError, setProfileError] = useState('')
  const [store, setStore] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [page, setPage] = useState(1)
  const query = `storeId=${encodeURIComponent(store)}&from=${from}&to=${to}&page=${page}`
  const { data, loading, error, refresh } = useConsumptionRecords(signedIn && !!profile?.phoneVerified, query)
  const [detail, setDetail] = useState<ConsumptionRecord | null>(null), [detailId, setDetailId] = useState(''), [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false), [scrollTop, setScrollTop] = useState(0)
  const sequence = useRef(0), detailSequence = useRef(0), currentScroll = useRef(0), listScroll = useRef(0)
  const stores = [{ id: '', name: '全部门店' }, ...(data?.stores || [])]
  const time = (value: string) => new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-GB', { timeZone: 'Asia/Shanghai', hour12: false })
  async function loadProfile() {
    if (!signedIn) return
    const seq = ++sequence.current
    try { const result = await request<CustomerProfile>('/api/me/profile'); if (seq === sequence.current) { setProfile(result); setProfileError('') } }
    catch (cause) { if (seq === sequence.current) setProfileError((cause as Error).message) }
  }
  async function openDetail(id: string) {
    const seq = ++detailSequence.current
    if (!detailId) listScroll.current = currentScroll.current
    setDetailId(id); setDetail(null); setDetailError(''); setDetailLoading(true); setScrollTop(0)
    try { const result = await request<ConsumptionRecord>('/api/me/consumption-records/' + encodeURIComponent(id)); if (seq === detailSequence.current) setDetail(result) }
    catch (cause) { if (seq === detailSequence.current) setDetailError((cause as Error).message) }
    finally { if (seq === detailSequence.current) setDetailLoading(false) }
  }
  function closeDetail() { detailSequence.current++; setDetailId(''); setDetail(null); setDetailError(''); setScrollTop(listScroll.current) }
  function filter(next: () => void) { next(); setPage(1); setScrollTop(0) }
  useEffect(() => {
    if (signedIn) void loadProfile()
    else { setProfile(null); closeDetail() }
    return () => { sequence.current++; detailSequence.current++ }
  }, [signedIn])
  useDidShow(() => { void loadProfile(); if (detailId) void openDetail(detailId) })
  useDidHide(() => { sequence.current++; detailSequence.current++ })
  useEffect(() => { if (detailId) { const next = data?.items.find(item => item.id === detailId); if (next) setDetail(next) } }, [data])
  if (!signedIn) return <View className={`page consumption-page locale-${locale}`}><CustomerLoginHero onSignedIn={() => {}} /></View>
  return <View className={`page consumption-page locale-${locale}`}>
    <View className='consumption-header'><View className='customer-heading-top'><Text className='eyebrow'>YOUR CARE HISTORY</Text><LanguageSwitcher compact /></View><View className='consumption-title-row'><View className='heading'>{t(detailId ? '消费详情' : '消费记录')}</View><Button className='consumption-text-button' disabled={loading || detailLoading} onClick={() => { void refresh(); if (detailId) void openDetail(detailId) }}>{t('刷新')}</Button></View><Text className='consumption-caption'>{t('每一次养护，都有记录可查。')}</Text>
      {profile?.phoneVerified && !detailId && <View className='consumption-filters'>
        <OptionSelect title={t('消费门店')} options={stores.map(item => t(item.name))} value={Math.max(0, stores.findIndex(item => item.id === store))} triggerClassName='consumption-filter' onChange={index => filter(() => setStore(stores[index]?.id || ''))} />
        <View className='consumption-date-filters'><Picker mode='date' value={from} end={to || undefined} onChange={event => filter(() => setFrom(String(event.detail.value)))}><View className='consumption-filter'>{from || t('开始日期')}<Text>⌄</Text></View></Picker><Text>—</Text><Picker mode='date' value={to} start={from || undefined} onChange={event => filter(() => setTo(String(event.detail.value)))}><View className='consumption-filter'>{to || t('结束日期')}<Text>⌄</Text></View></Picker></View>
        {(store || from || to) && <Button className='consumption-text-button consumption-clear' onClick={() => filter(() => { setStore(''); setFrom(''); setTo('') })}>{t('清除筛选')}</Button>}
      </View>}
      {detailId && <Button className='consumption-back consumption-text-button' onClick={closeDetail}>‹ {t('返回消费列表')}</Button>}
    </View>
    <ScrollView scrollY className='consumption-scroll' scrollTop={scrollTop} onScroll={event => { currentScroll.current = event.detail.scrollTop }}><View className='consumption-content'>
      {profileError && <View className='consumption-error' role='alert'>{t(profileError)}<Button className='secondary' onClick={() => { void loadProfile() }}>{t('重新加载')}</Button></View>}
      {!profile && !profileError && <View className='consumption-empty'>{t('正在加载…')}</View>}
      {profile && !profile.phoneVerified && <View className='consumption-verify'><View className='consumption-section-title'>{t('先验证您的手机号')}</View><Text>{t('授权手机号后，仅显示与您的客户档案关联的消费记录。')}</Text><CustomerProfileCard showWallet={false} onChanged={setProfile} /></View>}
      {profile?.phoneVerified && (detailId ? <>
        {detailLoading && <View className='consumption-empty'>{t('正在加载…')}</View>}
        {detailError && <View className='consumption-error' role='alert'>{t(detailError)}<Button className='secondary' onClick={() => { void openDetail(detailId) }}>{t('重新加载')}</Button></View>}
        {detail && <View className={`consumption-detail is-${detail.status.toLowerCase()}`}>
          <View className='consumption-detail-top'><Text className='consumption-status'>{t(states[detail.status])}</Text><Text className='consumption-source'>{t(detail.source !== 'WALLET' ? '原系统消费' : '会员储值消费')}</Text></View>
          <View className='consumption-detail-project'>{t(detail.projectName || '会员消费（项目待核对）')}</View><View className='consumption-detail-amount'>{money(detail.paidFen)}</View>
          {detail.status !== 'RECORDED' && <View className='consumption-invalid-note'>{t(detail.status === 'REVERSED' ? '此笔消费已冲正，原记录保留供核对。' : '此条历史记录已作废，请以核对后的有效记录为准。')}</View>}
          <View className='consumption-detail-row'><Text>{t('消费门店')}</Text><Text>{t(detail.storeName)}</Text></View>
          <View className='consumption-detail-row'><Text>{t('消费时间')}</Text><Text>{time(detail.businessAt)}</Text></View>
          <View className='consumption-detail-row'><Text>{t('订单 / 凭证编号')}</Text><Text selectable>{detail.referenceNo}</Text></View>
          <View className='consumption-detail-row'><Text>{t('记录来源')}</Text><Text>{t(detail.source !== 'WALLET' ? '原系统历史记录' : '门店消费登记')}</Text></View>
          {detail.accountLabel && <View className='consumption-detail-row'><Text>{t('扣款账户')}</Text><Text>{t(detail.accountLabel)}</Text></View>}
          {detail.balanceAfterFen !== null && <View className='consumption-detail-row'><Text>{t('消费后余额')}</Text><Text>{money(detail.balanceAfterFen)}</Text></View>}
          {detail.publicNote && <View className='consumption-detail-note'><Text>{t('消费说明')}</Text><Text>{detail.publicNote}</Text></View>}
        </View>}
      </> : <>
        <MemberSyncStatus sync={data?.sourceSync}/><View className='consumption-migration-note'>{t(data?.sourceSync?.enabled?'消费记录在后台定时同步，日期和门店仅用于筛选已同步记录。':'当前仅展示已登记或已迁入的消费。酷鼠历史明细正在分批核对，未显示不代表没有消费。')}</View>
        {error && <View className='consumption-error' role='alert'>{t(data ? '记录暂未更新，当前显示上次查询结果。' : error)}<Button className='secondary' onClick={() => { void refresh() }}>{t('重新加载')}</Button></View>}
        {loading && !data && <View className='consumption-empty'>{t('正在加载…')}</View>}
        {data && !data.items.length && <View className='consumption-empty'><View className='consumption-section-title'>{t(store || from || to ? '当前筛选下暂无记录' : '暂未查到已登记的消费')}</View><Text>{t('如需查询尚未迁入的消费明细，请联系门店核对。')}</Text></View>}
        {data?.items.map(item => <Button key={item.id} className={`consumption-card is-${item.status.toLowerCase()}`} onClick={() => { void openDetail(item.id) }}><View className='consumption-card-top'><Text className='consumption-project'>{t(item.projectName || '会员消费（项目待核对）')}</Text><Text className='consumption-card-amount'>{money(item.paidFen)}</Text></View><View className='consumption-card-store'>{t(item.storeName)}</View><View className='consumption-card-meta'><Text>{time(item.businessAt)}</Text><Text className='consumption-status'>{t(states[item.status])}</Text></View><View className='consumption-card-bottom'><Text>{t(item.source !== 'WALLET' ? '原系统消费' : '会员储值消费')}</Text><Text>{t('查看详情')} ›</Text></View></Button>)}
        {data && data.total > data.pageSize && <View className='consumption-pagination'><Button className='secondary' disabled={page === 1 || loading} onClick={() => { setPage(value => value - 1); setScrollTop(0) }}>{t('上一页')}</Button><Text>{page} / {Math.ceil(data.total / data.pageSize)}</Text><Button className='secondary' disabled={page * data.pageSize >= data.total || loading} onClick={() => { setPage(value => value + 1); setScrollTop(0) }}>{t('下一页')}</Button></View>}
      </>)}
      <View className='consumption-footnote'>{t('对消费项目或金额有疑问，请联系对应门店核对。')}</View>
    </View></ScrollView>
  </View>
}

export default withLaunchNotice(ConsumptionPage)
