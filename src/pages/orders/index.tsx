import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow, usePullDownRefresh, useUnload } from '@tarojs/taro'
import { Button, Image, Picker, Text, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import SubscriptionPreferences, { type SubscriptionStatus } from '../../components/SubscriptionPreferences'
import { call, hasCustomerSession, logout, openCustomerLogin, request, subscribe, toastError } from '../../services/api'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import { loadRuntime, loadSite, themeStyle } from '../../services/site'
import { day, message, RequestScope } from '../../utils/booking'
import type { Appointment, Runtime, Site, Slots } from '../../types'
import ordersIcon from '../../assets/tabbar/orders-active.png'
import './index.scss'

export default function Orders() {
  const signedIn = useCustomerSession()
  const [subscriptionStatus,setSubscriptionStatus]=useState<SubscriptionStatus|null>(null)
  const [orders, setOrders] = useState<Appointment[]>([]), [site, setSite] = useState<Site | null>(null), [runtime, setRuntime] = useState<Runtime>({}), [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null), [date, setDate] = useState(day(1)), [times, setTimes] = useState<string[]>([]), [timeIndex, setTimeIndex] = useState(0), [lastDay, setLastDay] = useState(day(7)), [timesLoading, setTimesLoading] = useState(false)
  const visible = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), pending = useRef<Promise<void> | undefined>(undefined), scope = useRef(new RequestScope()), sending = useRef(false)
  async function load() {
    if (pending.current) return pending.current
    pending.current = (async () => {
      setLoading(hasCustomerSession())
      try {
        const [nextSite, nextRuntime] = await Promise.all([loadSite(), loadRuntime()])
        if (visible.current) { setSite(nextSite); setRuntime(nextRuntime) }
        if (!hasCustomerSession()) { if (visible.current) { setOrders([]); setSubscriptionStatus(null) }; return }
        const [items, nextSubscription] = await Promise.all([request<Appointment[]>('/api/me/appointments'), request<SubscriptionStatus>('/api/me/subscriptions').catch(() => null)])
        if (visible.current && hasCustomerSession()) { setOrders(items); setSubscriptionStatus(nextSubscription); setError('') }
      }
      catch (e) { if (visible.current) setError(message(e)) }
      finally { if (visible.current) setLoading(false); void Taro.stopPullDownRefresh() }
    })()
    try { await pending.current } finally { pending.current = undefined }
  }
  async function poll() { clearTimeout(timer.current); await load(); if (visible.current && hasCustomerSession()) timer.current = setTimeout(() => { void poll() }, 30000 + Math.random() * 5000) }
  function stop() { visible.current = false; clearTimeout(timer.current); scope.current.cancel(); setEditing(null); setTimes([]) }
  useDidShow(() => { visible.current = true; void poll() }); useDidHide(stop); useUnload(stop); usePullDownRefresh(() => { void load() })
  useEffect(() => {
    if (!signedIn) { clearTimeout(timer.current); scope.current.cancel(); setOrders([]); setSubscriptionStatus(null); setEditing(null); setTimes([]); setLoading(false) }
  }, [signedIn])
  async function signOut() {
    const result = await Taro.showModal({ title: '退出当前登录', content: '退出后可继续浏览门店和项目。已提交的预约与咨询记录会保留。', confirmText: '退出登录' })
    if (result.confirm) { logout(); setError('') }
  }
  useEffect(() => {
    let alive = true; const version = scope.current.next(); setTimes([]); setTimeIndex(0); setTimesLoading(!!editing)
    if (editing) request<Slots>(`/api/me/appointments/${editing.id}/slots?date=${date}`).then(result => { if (alive && scope.current.valid(version)) { setTimes(result.slots.filter(item => item.available && item.remaining >= editing.headcount).map(item => item.time)); setLastDay(day(result.rules.advanceDays)) } }).catch(e => { if (alive && scope.current.valid(version)) toastError(e) }).finally(() => { if (alive && scope.current.valid(version)) setTimesLoading(false) })
    return () => { alive = false }
  }, [editing?.id, date])
  async function cancel(item: Appointment) {
    if (sending.current) return
    const result = await Taro.showModal({ title: '取消到店申请', content: '取消后将释放本次预约名额。确定取消吗？', confirmText: '确定取消' })
    if (!result.confirm || sending.current) return
    sending.current = true; setBusy(true)
    try { await request(`/api/me/appointments/${item.id}`, { method: 'PATCH', data: { action: 'cancel', version: item.version, note: '客户取消预约' } }); await load() } catch (e) { toastError(e); await load() } finally { sending.current = false; setBusy(false) }
  }
  async function save() {
    if (sending.current || !editing || !times[timeIndex] || timesLoading) return
    if (!hasCustomerSession()) { void openCustomerLogin('/pages/orders/index').catch(toastError); return }
    sending.current = true; setBusy(true)
    try { const subscription = subscribe(runtime.customerTemplateIds || runtime.customerTemplateId); await subscription; await request(`/api/me/appointments/${editing.id}`, { method: 'PATCH', data: { action: 'reschedule', version: editing.version, date, startTime: times[timeIndex] } }); setEditing(null); await load(); void Taro.showModal({ title: '改约申请已提交', content: '新的到店时间需要门店重新人工确认，请以确认结果为准。', showCancel: false }) } catch (e) { toastError(e); await load() } finally { sending.current = false; setBusy(false) }
  }
  return <View className='page orders-page' style={themeStyle(site)}><View className='section'><Text className='eyebrow'>MY APPOINTMENTS</Text><View className='heading'>我的预约</View>
    {signedIn ? <View className='customer-account'><View><View className='account-title'>欢迎来到裕和堂</View><View className='tiny'>已登录 · 预约与咨询记录为您保留</View></View><Button disabled={busy} onClick={() => { void signOut() }}>退出登录</Button></View> : <View className='customer-login-card'><View className='customer-login-mark'>裕</View><View className='empty-title'>登录，留住每一次养护时光</View><View className='muted'>查看预约进度，与门店沟通到店安排。</View><Button className='primary' onClick={() => { void openCustomerLogin('/pages/orders/index').catch(toastError) }}>微信登录</Button><Button className='customer-browse' onClick={() => { void Taro.switchTab({ url: '/pages/stores/index' }) }}>先看看门店与项目 ›</Button></View>}
    {error && <View className='error-bar'>{error}<Button onClick={() => { if (hasCustomerSession()) void load(); else void openCustomerLogin('/pages/orders/index').catch(toastError) }}>{signedIn ? '重新加载' : '去登录'}</Button></View>}
    {signedIn && <><View className='banner'>预约需门店人工确认，请以门店确认结果为准。</View>{loading && !orders.length && <View className='empty'>正在加载预约…</View>}{!error && !loading && !orders.length && <View className='empty'><Image className='empty-icon' src={ordersIcon} /><View className='empty-title'>还没有预约</View><View>为自己留一点时间，从一场放松开始。</View><Button className='primary' onClick={() => { void Taro.navigateTo({ url: '/pages/booking/index' }) }}>去预约</Button></View>}
    {orders.map(item => <View className='order' key={item.id}><View className='order-top'><Text>{item.storeName}</Text><Text className={`status ${item.status}`}>{item.statusLabel}</Text></View><View className='card-title'>{item.serviceName}</View><View className='appointment-time'>{item.bookingDate} {item.startTime} · {item.headcount} 人同行</View><View className='muted'>调理师意向：{item.therapistIntentName || '门店安排'}</View>{item.message && <View className='banner'>{item.message}</View>}<View className='tiny'>预约编号：{item.id}</View><View className='order-actions'>{['PENDING', 'CONFIRMED'].includes(item.status) && <><Button className='secondary' disabled={busy} onClick={() => { setEditing(item); setDate(item.bookingDate) }}>申请改约</Button><Button className='secondary' disabled={busy} onClick={() => { void cancel(item) }}>取消预约</Button></>}<Button className='secondary' onClick={() => call(site?.stores.find(store => store.id === item.storeId)?.phone)}>致电门店</Button></View>{editing?.id === item.id && <View className='edit-panel'><View className='label'>选择新的到店时间</View><Picker mode='date' value={date} start={day()} end={lastDay} disabled={busy} onChange={e => setDate(e.detail.value)}><View className='picker'>{date}　›</View></Picker><Picker range={times} value={timeIndex} disabled={busy || timesLoading || !times.length} onChange={e => setTimeIndex(Number(e.detail.value))}><View className='picker'>{timesLoading ? '正在查询名额…' : times[timeIndex] || '当日暂无可用时段'}　›</View></Picker><View className='bottom-actions'><Button className='secondary' disabled={busy} onClick={() => { scope.current.cancel(); setEditing(null) }}>暂不改约</Button><Button className='primary' disabled={busy || timesLoading || !times.length} loading={busy} onClick={() => { void save() }}>提交改约</Button></View></View>}<CustomerService storeId={item.storeId} variant='order' /></View>)}
    {orders.length >= 100 && <View className='tiny'>当前展示最近 100 条预约，如需更早记录请联系门店。</View>}<SubscriptionPreferences status={subscriptionStatus} onRefresh={load}/></>}{(!signedIn || !orders.length) && <CustomerService />}</View></View>
}
