import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow, usePullDownRefresh, useUnload } from '@tarojs/taro'
import { Button, Image, Picker, Text, View } from '@tarojs/components'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { hasCustomerSession, isWeapp, logout, request, subscribeBooking, toastError } from '../../services/api'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import { loadRuntime, loadSite, themeStyle } from '../../services/site'
import { day, message, RequestScope } from '../../utils/booking'
import { appointmentActions, deadlineLabel, stampAppointments } from '../../utils/appointment-actions'
import type { Appointment, Runtime, Site, Slots } from '../../types'
import ordersIcon from '../../assets/tabbar/orders-active.png'
import './index.scss'

export default function Orders() {
  const signedIn = useCustomerSession()
  const [orders, setOrders] = useState<Appointment[]>([]), [site, setSite] = useState<Site | null>(null), [runtime, setRuntime] = useState<Runtime>({}), [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Appointment | null>(null), [date, setDate] = useState(day(1)), [times, setTimes] = useState<string[]>([]), [timeIndex, setTimeIndex] = useState(0), [lastDay, setLastDay] = useState(day(7)), [timesLoading, setTimesLoading] = useState(false)
  const [clock, setClock] = useState(Date.now())
  const visible = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), clockTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined), pending = useRef<Promise<void> | undefined>(undefined), scope = useRef(new RequestScope()), sending = useRef(false)
  async function load() {
    if (pending.current) return pending.current
    pending.current = (async () => {
      setLoading(hasCustomerSession())
      try {
        const [nextSite, nextRuntime] = await Promise.all([loadSite(), loadRuntime()])
        if (visible.current) { setSite(nextSite); setRuntime(nextRuntime) }
        if (!hasCustomerSession()) { if (visible.current) setOrders([]); return }
        const items = await request<Appointment[]>('/api/me/appointments')
        if (visible.current && hasCustomerSession()) { setOrders(stampAppointments(items)); setError('') }
      }
      catch (e) { if (visible.current) setError(message(e)) }
      finally { if (visible.current) setLoading(false); void Taro.stopPullDownRefresh() }
    })()
    try { await pending.current } finally { pending.current = undefined }
  }
  async function poll() { clearTimeout(timer.current); await load(); if (visible.current && hasCustomerSession()) timer.current = setTimeout(() => { void poll() }, 30000 + Math.random() * 5000) }
  function stop() { visible.current = false; clearTimeout(timer.current); clearInterval(clockTimer.current); scope.current.cancel(); setEditing(null); setTimes([]) }
  useDidShow(() => { visible.current = true; setClock(Date.now()); clearInterval(clockTimer.current); clockTimer.current = setInterval(() => setClock(Date.now()), 1000); void poll() }); useDidHide(stop); useUnload(stop); usePullDownRefresh(() => { void load() })
  useEffect(() => {
    if (isWeapp) void Taro.setNavigationBarColor({ frontColor: signedIn ? '#000000' : '#ffffff', backgroundColor: signedIn ? '#faf9f3' : '#344338' }).catch(() => {})
    if (signedIn && visible.current) void poll()
    if (!signedIn) { clearTimeout(timer.current); scope.current.cancel(); setOrders([]); setEditing(null); setTimes([]); setLoading(false) }
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
  function allowed(item: Appointment, action: 'canCancel' | 'canReschedule' | 'canWithdrawReschedule') {
    const current = orders.find(order => order.id === item.id) || item
    const policy = appointmentActions(current)
    if (policy[action]) return true
    toastError(new Error(policy.reason || '预约已更新，请刷新后查看。')); void load(); return false
  }
  async function cancel(item: Appointment) {
    if (sending.current || !allowed(item, 'canCancel')) return
    const result = await Taro.showModal({ title: '取消到店申请', content: '取消后将释放本次预约名额。确定取消吗？', confirmText: '确定取消' })
    if (!result.confirm || sending.current || !allowed(item, 'canCancel')) return
    sending.current = true; setBusy(true)
    try { await request(`/api/me/appointments/${item.id}`, { method: 'PATCH', data: { action: 'cancel', version: item.version, note: '客户取消预约' } }); await load() } catch (e) { toastError(e); await load() } finally { sending.current = false; setBusy(false) }
  }
  async function withdraw(item: Appointment) {
    if (sending.current || !allowed(item, 'canWithdrawReschedule')) return
    const result = await Taro.showModal({ title: '撤回改约申请', content: '撤回后仍保留原预约时间和名额，不会取消原预约。', confirmText: '撤回申请' })
    if (!result.confirm || sending.current || !allowed(item, 'canWithdrawReschedule')) return
    sending.current = true; setBusy(true)
    try { await request(`/api/me/appointments/${item.id}`, { method: 'PATCH', data: { action: 'withdraw_reschedule', version: item.version } }); await load() } catch (e) { toastError(e); await load() } finally { sending.current = false; setBusy(false) }
  }
  async function save() {
    if (sending.current || !editing || !times[timeIndex] || timesLoading) return
    if (!hasCustomerSession() || !allowed(editing, 'canReschedule')) return
    sending.current = true; setBusy(true)
    try { const subscription = subscribeBooking(runtime); await subscription; await request(`/api/me/appointments/${editing.id}`, { method: 'PATCH', data: { action: 'reschedule', version: editing.version, date, startTime: times[timeIndex] } }); setEditing(null); await load(); void Taro.showModal({ title: '改约申请已提交', content: '原预约时间和名额继续保留。门店同意后新时间才会生效，未同意或超时将保留原预约。', showCancel: false }) } catch (e) { toastError(e); await load() } finally { sending.current = false; setBusy(false) }
  }
  return <View className={`page orders-page ${!signedIn ? 'orders-guest' : ''} ${isWeapp ? 'is-weapp' : ''}`} style={themeStyle(site)}>
    {!signedIn ? <CustomerLoginHero withTabbar error={error} onSignedIn={() => { setError('') }} /> : <View className='section'><Text className='eyebrow'>MY APPOINTMENTS</Text><View className='heading'>我的预约</View>
    <View className='customer-account'><View><View className='account-title'>欢迎来到裕和堂</View><View className='tiny'>已登录 · 预约与咨询记录为您保留</View></View><Button disabled={busy} onClick={() => { void signOut() }}>退出登录</Button></View>
    {runtime.customerProfiles && <CustomerProfileCard />}
    {error && <View className='error-bar'>{error}<Button onClick={() => { void load() }}>重新加载</Button></View>}
    <View className='banner'>预约需门店人工确认，请以门店确认结果为准。</View>{loading && !orders.length && <View className='empty'>正在加载预约…</View>}{!error && !loading && !orders.length && <View className='empty'><Image className='empty-icon' src={ordersIcon} /><View className='empty-title'>还没有预约</View><View>为自己留一点时间，从一场放松开始。</View><Button className='primary' onClick={() => { void Taro.navigateTo({ url: '/pages/booking/index' }) }}>去预约</Button></View>}
    {orders.map(item => {
      const actions = appointmentActions(item, clock), change = item.rescheduleRequest
      return <View className='order' key={item.id}>
        <View className='order-top'><Text>{item.storeName}</Text><Text className={`status ${item.status}`}>{item.statusLabel}</Text></View>
        <View className='card-title'>{item.serviceName}</View>
        <View className='appointment-time'>{item.bookingDate} {item.startTime} · {item.headcount} 人同行</View>
        <View className='muted'>调理师意向：{item.therapistIntentName || '门店安排'}</View>
        {item.message && <View className='banner'>{item.message}</View>}
        {change && <View className={`reschedule-summary ${actions.pending ? 'pending' : ''}`}>
          <View className='reschedule-title'>{change.status === 'PENDING' && !actions.pending ? '改约已失效' : change.statusLabel}</View>
          <View>申请时间：{change.requestedDate} {change.requestedTime} · {change.requestedHeadcount} 人同行</View>
          {actions.pending ? <><View>门店确认前，仍按上方原预约安排。</View><View className='tiny'>处理期限：{deadlineLabel(change.expiresAt)}；超时保留原预约。</View></> : <View>{change.status === 'PENDING' ? '超过处理期限，原预约保持不变。' : change.resolutionNote}</View>}
          {actions.canWithdrawReschedule && <Button className='secondary' disabled={busy} onClick={() => { void withdraw(item) }}>撤回改约申请</Button>}
        </View>}
        <View className='tiny'>预约编号：{item.id}</View>
        {['PENDING', 'CONFIRMED'].includes(item.status) && <View className='change-policy'>
          {(actions.canCancel || actions.canReschedule) ? <Text>自助取消／改约截止：{deadlineLabel(item.customerActions?.deadline)}，逾期请联系门店。</Text> : <Text>{actions.reason}</Text>}
        </View>}
        {(actions.canReschedule || actions.canCancel) && <View className='order-actions'>
          {actions.canReschedule && <Button className='secondary' disabled={busy} onClick={() => { if (allowed(item, 'canReschedule')) { setEditing(item); setDate(item.bookingDate) } }}>申请改约</Button>}
          {actions.canCancel && <Button className='secondary' disabled={busy} onClick={() => { void cancel(item) }}>取消预约</Button>}
        </View>}
        {editing?.id === item.id && actions.canReschedule && <View className='edit-panel'>
          <View className='label'>选择新的到店时间</View><View className='tiny'>提交申请后保留原预约；新时段名额以门店处理时为准。</View>
          <Picker mode='date' value={date} start={day()} end={lastDay} disabled={busy} onChange={e => setDate(e.detail.value)}><View className='picker'>{date}　›</View></Picker>
          <Picker range={times} value={timeIndex} disabled={busy || timesLoading || !times.length} onChange={e => setTimeIndex(Number(e.detail.value))}><View className='picker'>{timesLoading ? '正在查询名额…' : times[timeIndex] || '当日暂无可用时段'}　›</View></Picker>
          <View className='bottom-actions'><Button className='secondary' disabled={busy} onClick={() => { scope.current.cancel(); setEditing(null) }}>暂不改约</Button><Button className='primary' disabled={busy || timesLoading || !times.length || (date === item.bookingDate && times[timeIndex] === item.startTime)} loading={busy} onClick={() => { void save() }}>提交改约</Button></View>
        </View>}
      </View>
    })}
    {orders.length >= 100 && <View className='tiny'>当前展示最近 100 条预约，如需更早记录请联系门店。</View>}</View>}</View>
}
