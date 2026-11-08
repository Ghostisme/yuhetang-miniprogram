import { useEffect, useRef, useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Image, Input, Picker, Text, Textarea, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import { CustomerLoginSheet } from '../../components/CustomerLogin'
import PageState from '../../components/PageState'
import BookingSubscriptionNotice from '../../components/BookingSubscriptionNotice'
import { call, hasCustomerSession, isWeapp, media, privacy, request, subscribe, toastError } from '../../services/api'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import type {SubscriptionResult} from '../../services/api'
import { loadRuntime, loadSite, themeStyle } from '../../services/site'
import { day, message, newId } from '../../utils/booking'
import type { Appointment, Runtime, ServiceItem, Site, Slots, Therapist } from '../../types'
import './index.scss'

const steps = ['选择门店', '选择项目', '到店时间', '预约信息']
const stepHints = ['选择一家方便到访的门店', '选一份适合自己的养护', '把一段时间留给自己', '留下信息，静候门店确认']
const claims = ['YES', 'NO', 'UNKNOWN'], claimNames = ['是', '否', '不确定']
export default function Booking() {
  const { params } = useRouter()
  const signedIn = useCustomerSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [site, setSite] = useState<Site | null>(null), [runtime, setRuntime] = useState<Runtime>({}), [error, setError] = useState('')
  const [step, setStep] = useState(0), [storeId, setStoreId] = useState(params.storeId || ''), [serviceId, setServiceId] = useState(params.serviceId || '')
  const [services, setServices] = useState<ServiceItem[]>([]), [servicesLoading, setServicesLoading] = useState(false)
  const [teachers, setTeachers] = useState<Therapist[]>([]), [teachersLoading, setTeachersLoading] = useState(false), [teacherId, setTeacherId] = useState('')
  const [date, setDate] = useState(day(1)), [slots, setSlots] = useState<Slots | null>(null), [slotsLoading, setSlotsLoading] = useState(false), [time, setTime] = useState(''), [headcount, setHeadcount] = useState(1), [revision, setRevision] = useState(0)
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [member, setMember] = useState(2), [visited, setVisited] = useState(2), [remark, setRemark] = useState(''), [consent, setConsent] = useState(false), [sensitive, setSensitive] = useState(false)
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Appointment | null>(null)
  const [subscriptionResult,setSubscriptionResult]=useState<SubscriptionResult|null>(null)
  const key = useRef(newId()), sending = useRef(false)
  const store = site?.stores.find(item => item.enabled && item.id === storeId && item.onlineBooking)
  const service = services.find(item => item.id === serviceId)
  const retry = () => { setRevision(value => value + 1) }
  const changed = (update: () => void) => { key.current = newId(); update() }
  useEffect(() => { let alive = true; Promise.all([loadSite(), loadRuntime()]).then(([nextSite, nextRuntime]) => { if (alive) { setSite(nextSite); setRuntime(nextRuntime); setError('') } }).catch(e => { if (alive) setError(message(e)) }); return () => { alive = false } }, [revision])
  useEffect(() => {
    let alive = true
    setServices([]); setTeacherId(''); setTime(''); setServicesLoading(!!store)
    if (store) request<ServiceItem[]>(`/api/stores/${store.id}/services`).then(media).then(items => { if (alive) { const next = items.filter(item => item.enabled); setServices(next); setServiceId(id => next.some(item => item.id === id) ? id : ''); setError('') } }).catch(e => { if (alive) { setServiceId(''); setError(message(e)) } }).finally(() => { if (alive) setServicesLoading(false) })
    return () => { alive = false }
  }, [store?.id, revision])
  useEffect(() => {
    let alive = true
    setTeachers([]); setTeacherId(''); setTeachersLoading(!!(store && service))
    if (store && service) request<Therapist[]>(`/api/stores/${store.id}/therapists`).then(items => { if (alive) setTeachers(items.filter(item => item.storeId === store.id && item.enabled && !item.resting && item.serviceIds.includes(service.id))) }).catch(e => { if (alive) setError(message(e)) }).finally(() => { if (alive) setTeachersLoading(false) })
    return () => { alive = false }
  }, [store?.id, service?.id, revision])
  useEffect(() => {
    let alive = true
    setSlots(null); setTime(''); setSlotsLoading(!!store)
    if (store) request<Slots>(`/api/stores/${store.id}/slots?date=${date}`).then(result => { if (alive) { setSlots(result); setHeadcount(value => Math.min(value, result.rules.maxHeadcount)); setError('') } }).catch(e => { if (alive) setError(message(e)) }).finally(() => { if (alive) setSlotsLoading(false) })
    return () => { alive = false }
  }, [store?.id, date, revision])
  const showPrivacy = () => { void Taro.showModal({ title: '预约隐私说明', content: '我们收集称呼、联系电话、到店时间、人数及服务意向，用于门店接待、确认与必要通知。会员信息为本人自述，需门店核实。请勿填写身份证、病历等不必要资料；如自愿提供健康信息，请单独勾选同意。您可通过微信客服联系门店更正、删除资料，完整规则以小程序隐私保护指引为准。', showCancel: false }) }
  function next() {
    const problem = step === 0 && !store ? '请选择开放预约的门店。' : step === 1 && (servicesLoading || !service) ? '请选择本店养护项目。' : step === 2 && (!time || slotsLoading) ? '请选择可用时段。' : ''
    if (problem) return toastError(new Error(problem))
    setStep(value => Math.min(3, value + 1)); void Taro.pageScrollTo({ scrollTop: 0, duration: 150 })
  }
  async function submit() {
    if (sending.current) return
    if (!hasCustomerSession()) { setLoginOpen(true); return }
    const chosen = teachers.find(item => item.id === teacherId)
    if (!store || !service || servicesLoading || teachersLoading || slotsLoading || !slots?.slots.some(item => item.time === time && item.available && item.remaining >= headcount)) return toastError(new Error('请重新确认门店、项目及可用时段。'))
    if (teacherId && (!chosen || chosen.storeId !== storeId)) return toastError(new Error('请重新选择本店调理师。'))
    if (!name.trim() || !/^1[3-9]\d{9}$/.test(phone)) return toastError(new Error('请填写称呼和正确的11位手机号。'))
    if (!consent) return toastError(new Error('请阅读并同意预约隐私说明。'))
    sending.current = true; setBusy(true); setError('')
    try {
      const subscription = subscribe(runtime.customerTemplateIds || runtime.customerTemplateId)
      setSubscriptionResult(await subscription); await privacy()
      const result = await request<Appointment>('/api/appointments', { method: 'POST', headers: { 'Idempotency-Key': key.current }, data: { storeId, serviceId, date, startTime: time, headcount, name: name.trim(), phone, therapistIntentId: teacherId, memberClaim: claims[member], visitedClaim: claims[visited], remark, privacyConsent: true, sensitiveConsent: sensitive } })
      setReceipt(result); void Taro.pageScrollTo({ scrollTop: 0, duration: 150 })
    } catch (e) { setError(message(e)); toastError(e); retry() }
    finally { sending.current = false; setBusy(false) }
  }
  if (!site) return <PageState error={error} retry={retry} />
  const teacherNames = ['门店安排（不指定）', ...teachers.map(item => `${item.name} · ${item.grade} · ${item.storeName}`)]
  const counts = Array.from({ length: slots?.rules.maxHeadcount || 4 }, (_, index) => `${index + 1} 人`)
  return <View className='page booking-page' style={themeStyle(site)}>
    {receipt ? <View className='article receipt'><View className='receipt-icon'>✓</View><View className='heading'>预约申请已提交</View><View className='banner'>需门店人工确认后安排到店，请留意预约处理通知。</View><View className='receipt-card'>{[['预约编号', receipt.id], ['养护项目', receipt.serviceName], ['预约门店', receipt.storeName], ['到店时间', `${receipt.bookingDate} ${receipt.startTime}`], ['同行人数', `${receipt.headcount} 人`], ['调理师意向', receipt.therapistIntentName || '门店安排']].map(([label, value]) => <View className='receipt-row' key={label}><Text className='label'>{label}</Text><Text className='value'>{value}</Text></View>)}</View>{isWeapp&&subscriptionResult&&<View className='subscription-receipt'>{subscriptionResult.error|| (subscriptionResult.recorded?`已登记 ${subscriptionResult.recorded} 项消息提醒，可在“我的预约”管理订阅。`:'本次未开启消息提醒，可在“我的预约”查看状态或重新订阅。')}</View>}<Button className='primary' onClick={() => { void Taro.switchTab({ url: '/pages/orders/index' }) }}>查看我的预约</Button><Button className='secondary' onClick={() => call(store?.phone)}>致电门店</Button><CustomerService storeId={receipt.storeId} /></View> : <View className='section'>
      <Text className='eyebrow'>YOUR MOMENT OF CARE</Text><View className='heading'>预约一段自在时光</View><View className='steps'>{steps.map((label, index) => <Button key={label} className={step === index ? 'active' : index < step ? 'done' : ''} disabled={busy || index > step} onClick={() => { if (index < step && !busy) setStep(index) }}><Text className='n'>{index < step ? '✓' : index + 1}</Text><Text>{label}</Text></Button>)}</View><View className='step-intro'><Text className='step-count'>0{step + 1}</Text><View>{stepHints[step]}</View></View>
      {error && <View className='error-bar'>{error}<Button onClick={retry}>重试</Button></View>}
      {step === 0 && <>{site.stores.filter(item => item.enabled).map(item => <View className={`choice ${storeId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { if (item.onlineBooking) changed(() => { setStoreId(item.id); setServices([]); setTeachers([]); setTime(''); setTeacherId('') }); else call(item.phone) }}><Image src={item.image} mode='aspectFill' /><View className='info'><View className='card-title'>{item.name}</View><View className='muted'>{item.address}</View><View className='tiny'>{item.onlineBooking ? item.hours : '暂未开放线上预约，请致电咨询'}</View></View><Text className='check'>{storeId === item.id ? '✓' : '›'}</Text></View>)}</>}
      {step === 1 && <><View className='selection-note'>{store?.name} · 本店开放项目</View>{servicesLoading ? <View className='empty'>正在加载本店项目…</View> : services.map(item => <View className={`choice ${serviceId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => changed(() => setServiceId(item.id))}><Image src={item.image} mode='aspectFill' /><View className='info'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><Text className='tiny'>{item.duration}</Text></View><Text className='check'>{serviceId === item.id ? '✓' : '›'}</Text></View>)}{!servicesLoading && !services.length && <View className='empty'>本店暂无开放项目，请联系门店。</View>}</>}
      {step === 2 && <><View className='selection-note'>{store?.name} · {service?.name}</View><View className='two-fields'><View className='field'><View className='label'>到店日期</View><Picker mode='date' value={date} start={day()} end={day(slots?.rules.advanceDays || 7)} disabled={busy} onChange={e => changed(() => { setDate(e.detail.value); setTime('') })}><View className='picker'>{date}　›</View></Picker></View><View className='field'><View className='label'>同行人数</View><Picker range={counts} value={headcount - 1} onChange={e => changed(() => { setHeadcount(Number(e.detail.value) + 1); setTime('') })}><View className='picker'>{headcount} 人　›</View></Picker></View></View><View className='label'>选择开始时间</View>{slotsLoading && <View className='empty'>正在查询名额…</View>}<View className='slot-grid'>{slots?.slots.map(item => <Button className={time === item.time ? 'active' : ''} key={item.time} disabled={!item.available || item.remaining < headcount} onClick={() => changed(() => setTime(item.time))}>{item.time}<Text className='tiny'>{item.available && item.remaining >= headcount ? `余 ${item.remaining} 位` : '不可预约'}</Text></Button>)}</View>{!slotsLoading && !slots?.slots.length && <View className='empty'>当日暂无可预约时段，请更换日期。</View>}<View className='banner'>提交后需门店确认；调理师、房间与床位以门店安排为准。</View></>}
      {step === 3 && <><View className='banner'>{store?.name} · {service?.name}<View>{date} {time} · {headcount} 人同行</View></View><View className='field'><View className='label'>您的称呼</View><Input className='input' value={name} maxlength={40} disabled={busy} placeholder='请输入称呼' onInput={e => changed(() => setName(e.detail.value))} /></View><View className='field'><View className='label'>联系电话</View><Input className='input' type='number' value={phone} maxlength={11} disabled={busy} placeholder='便于门店确认预约' onInput={e => changed(() => setPhone(e.detail.value))} /></View><View className='field'><View className='label'>调理师意向（非锁定安排）</View><Picker range={teacherNames} value={teachers.findIndex(item => item.id === teacherId) + 1} disabled={busy || teachersLoading} onChange={e => changed(() => setTeacherId(teachers[Number(e.detail.value) - 1]?.id || ''))}><View className='picker'>{teachersLoading ? '正在加载本店调理师…' : teacherNames[teachers.findIndex(item => item.id === teacherId) + 1]}　›</View></Picker></View><View className='two-fields'>{[['是否会员', member, setMember], ['是否到店过', visited, setVisited]].map(([label, value, setter]) => <View className='field' key={String(label)}><View className='label'>{String(label)}</View><Picker range={claimNames} value={Number(value)} disabled={busy} onChange={e => changed(() => (setter as (v: number) => void)(Number(e.detail.value)))}><View className='picker'>{claimNames[Number(value)]}　›</View></Picker></View>)}</View><View className='field'><View className='label'>备注（选填）</View><Textarea value={remark} maxlength={500} disabled={busy} placeholder='请勿填写身份证、病历等不必要信息' onInput={e => changed(() => setRemark(e.detail.value))} /></View><CheckboxGroup onChange={e => changed(() => setConsent(e.detail.value.includes('agree')))}><View className='agree'><Checkbox value='agree' checked={consent} disabled={busy} /><View className='agree-copy'>同意为预约接待处理必要信息，已阅读<Button className='text-link' onClick={showPrivacy}>《预约隐私说明》</Button></View></View></CheckboxGroup><CheckboxGroup onChange={e => changed(() => setSensitive(e.detail.value.includes('health')))}><View className='agree'><Checkbox value='health' checked={sensitive} disabled={busy} /><View className='agree-copy'>如自愿提供健康信息，同意仅用于本次接待（选填）</View></View></CheckboxGroup></>}
      {step===3&&<BookingSubscriptionNotice result={!!runtime.customerTemplateId} reminder={!!runtime.customerReminderTemplateId}/> }
      <View className='bottom-actions'>{step > 0 && <Button className='secondary' disabled={busy} onClick={() => setStep(value => value - 1)}>上一步</Button>}{step < 3 ? <Button className='primary' onClick={next}>下一步 →</Button> : <Button className='primary' loading={busy} disabled={busy} onClick={() => { void submit() }}>{signedIn ? '提交预约申请' : '微信登录后提交'}</Button>}</View>
      <CustomerService storeId={storeId} variant='inline' />
    </View>}
    <CustomerLoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} onSignedIn={() => { setLoginOpen(false); setError('') }} />
  </View>
}
