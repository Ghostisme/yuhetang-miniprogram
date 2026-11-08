import { localizeSite, localizeService, localizeTherapist } from '../../i18n/content'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { dialogLabels, t, useI18n } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Image, Input, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import MembershipSummary from '../../components/MembershipSummary'
import {verifiedBookingMember} from '../../utils/booking-member'
import { CustomerLoginSheet } from '../../components/CustomerLogin'
import PageState from '../../components/PageState'
import { call, hasCustomerSession, isWeapp, media, privacy, request, subscribeBooking, toastError } from '../../services/api'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import type {SubscriptionResult} from '../../services/api'
import { loadRuntime, loadSite, themeStyle } from '../../services/site'
import { day, message, newId } from '../../utils/booking'
import type { Appointment, CustomerProfile, Runtime, ServiceItem, Site, Slots, Therapist } from '../../types'
import './index.scss'

const steps = ['选择门店', '选择项目', '到店时间', '预约信息']
const stepHints = ['选择一家方便到访的门店', '选一份适合自己的养护', '把一段时间留给自己', '留下信息，静候门店确认']
const claims = ['YES', 'NO', 'UNKNOWN'], claimNames = ['是', '否', '不确定']
export default function Booking() {
  const { locale } = useI18n()
  const { params } = useRouter()
  const signedIn = useCustomerSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [rawSite, setSite] = useState<Site | null>(null), [runtime, setRuntime] = useState<Runtime>({}), [error, setError] = useState('')
  const [step, setStep] = useState(0), [storeId, setStoreId] = useState(params.storeId || ''), [serviceId, setServiceId] = useState(params.serviceId || '')
  const [rawServices, setServices] = useState<ServiceItem[]>([]), [servicesLoading, setServicesLoading] = useState(false)
  const [rawTeachers, setTeachers] = useState<Therapist[]>([]), [teachersLoading, setTeachersLoading] = useState(false), [teacherId, setTeacherId] = useState('')
  const [teacherError, setTeacherError] = useState(''), [teacherRevision, setTeacherRevision] = useState(0)
  const [date, setDate] = useState(day(1)), [slots, setSlots] = useState<Slots | null>(null), [slotsLoading, setSlotsLoading] = useState(false), [time, setTime] = useState(''), [headcount, setHeadcount] = useState(1), [revision, setRevision] = useState(0)
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [member, setMember] = useState(2), [visited, setVisited] = useState(2), [remark, setRemark] = useState(''), [consent, setConsent] = useState(false), [sensitive, setSensitive] = useState(false)
  const [profile,setProfile]=useState<CustomerProfile|null>(null)
  const memberRecognized=verifiedBookingMember(profile,phone)
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<Appointment | null>(null)
  const [subscriptionResult,setSubscriptionResult]=useState<SubscriptionResult|null>(null)
  const key = useRef(newId()), sending = useRef(false)
  const site = rawSite ? localizeSite(rawSite, locale) : null
  const services = rawServices.map(item => localizeService(item, locale))
  const teachers = rawTeachers.map(item => localizeTherapist(item, locale))
  const store = site?.stores.find(item => item.enabled && item.id === storeId && item.onlineBooking)
  const service = services.find(item => item.id === serviceId)
  const profileVersion = useRef(0)
  async function prefillProfile() {
    if (!hasCustomerSession() || !runtime.customerProfiles) {setProfile(null);return}
    const version = ++profileVersion.current
    try {
      const profile = await request<CustomerProfile>('/api/me/profile')
      if (profileVersion.current !== version || !hasCustomerSession()) return
      setProfile(profile);setName(previous => previous.trim() ? previous : profile.name)
      if (profile.phoneVerified) setPhone(previous => previous.trim() ? previous : profile.phone)
    } catch { /* Optional prefill must not block manual appointment contact details. */ }
  }
  useEffect(() => { void prefillProfile(); return () => { profileVersion.current++ } }, [signedIn, runtime.customerProfiles])
  useDidShow(() => { void prefillProfile() })
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
    setTeachers([]); setTeacherId(''); setTeacherError(''); setTeachersLoading(!!(store && service))
    if (store && service) request<Therapist[]>(`/api/stores/${store.id}/therapists`).then(items => { if (alive) setTeachers(items.filter(item => item.storeId === store.id && item.enabled && item.showOnClient && !item.resting && item.serviceIds.includes(service.id))) }).catch(e => { if (alive) setTeacherError(message(e)) }).finally(() => { if (alive) setTeachersLoading(false) })
    return () => { alive = false }
  }, [store?.id, service?.id, revision, teacherRevision])
  useEffect(() => {
    let alive = true
    setSlots(null); setTime(''); setSlotsLoading(!!store)
    if (store) request<Slots>(`/api/stores/${store.id}/slots?date=${date}`).then(result => { if (alive) { setSlots(result); setHeadcount(value => Math.min(value, result.rules.maxHeadcount)); setError('') } }).catch(e => { if (alive) setError(message(e)) }).finally(() => { if (alive) setSlotsLoading(false) })
    return () => { alive = false }
  }, [store?.id, date, revision])
  const showPrivacy = () => { void Taro.showModal({ ...dialogLabels(), title: t('预约隐私说明'), content: t('我们收集称呼、联系电话、到店时间、人数及服务意向，用于门店接待、确认与必要通知。会员信息为本人自述，需门店核实。请勿填写身份证、病历等不必要资料；如自愿提供健康信息，请单独勾选同意。您可通过微信客服联系门店更正、删除资料，完整规则以小程序隐私保护指引为准。'), showCancel: false }) }
  function next() {
    const problem = step === 0 && !store ? t('请选择开放预约的门店。') : step === 1 && (servicesLoading || !service) ? t('请选择本店养护项目。') : step === 2 && (!time || slotsLoading) ? t('请选择可用时段。') : ''
    if (problem) return toastError(new Error(problem))
    setStep(value => Math.min(3, value + 1))
  }
  async function submit() {
    if (sending.current) return
    if (!hasCustomerSession()) { setLoginOpen(true); return }
    const chosen = teachers.find(item => item.id === teacherId)
    if (!store || !service || servicesLoading || teachersLoading || slotsLoading || !slots?.slots.some(item => item.time === time && item.available && item.remaining >= headcount)) return toastError(new Error(t('请重新确认门店、项目及可用时段。')))
    if (teacherId && (!chosen || chosen.storeId !== storeId)) return toastError(new Error(t('请重新选择本店调理师。')))
    if (!name.trim() || !/^1[3-9]\d{9}$/.test(phone)) return toastError(new Error(t('请填写称呼和正确的11位手机号。')))
    if (!consent) return toastError(new Error(t('请阅读并同意预约隐私说明。')))
    sending.current = true; setBusy(true); setError('')
    try {
      const subscription = subscribeBooking(runtime)
      setSubscriptionResult(await subscription); await privacy()
      const result = await request<Appointment>('/api/appointments', { method: 'POST', headers: { 'Idempotency-Key': key.current }, data: { storeId, serviceId, date, startTime: time, headcount, name: name.trim(), phone, therapistIntentId: teacherId, memberClaim: memberRecognized?'YES':claims[member], visitedClaim: claims[visited], remark, privacyConsent: true, sensitiveConsent: sensitive } })
      setReceipt(result)
    } catch (e) { setError(message(e)); toastError(e); retry() }
    finally { sending.current = false; setBusy(false) }
  }
  if (!site) return <PageState error={t(error)} retry={retry} />
  const teacherNames = [t('门店安排（不指定）'), ...teachers.map(item => `${item.name}${item.grade ? ` · ${item.grade}` : ''}`)]
  const counts = Array.from({ length: slots?.rules.maxHeadcount || 4 }, (_, index) => t('{count} 人', { count: index + 1 }))
  return <View className={`page booking-page locale-${locale}`} style={themeStyle(site)}>{receipt && <LanguageSwitcher />}
    {receipt ? <><ScrollView className='booking-receipt-scroll' scrollY enhanced bounces={false}><View className='article receipt'><View className='receipt-icon'>✓</View><View className='heading'>{t("预约申请已提交")}</View><View className='banner'>{t("需门店人工确认后安排到店，请留意预约处理通知。")}</View><View className='receipt-card'>{[[t('预约编号'), receipt.id], [t('养护项目'), t(receipt.serviceName)], [t('预约门店'), t(receipt.storeName)], [t('到店时间'), `${receipt.bookingDate} ${receipt.startTime}`], [t('同行人数'), t('{count} 人', { count: receipt.headcount })], [t('调理师意向'), receipt.therapistIntentName || t('门店安排')]].map(([label, value]) => <View className='receipt-row' key={label}><Text className='label'>{t(label)}</Text><Text className='value'>{value}</Text></View>)}</View><MembershipSummary member={receipt.membership}/>{isWeapp&&subscriptionResult&&<View className='subscription-receipt'>{subscriptionResult.error|| (subscriptionResult.recorded?t('已按您的选择开启预约消息提醒。'):t('本次未开启微信提醒，可在“我的预约”查看预约状态。'))}</View>}</View></ScrollView><View className='receipt-actions'><View className='bottom-actions'><CustomerService site={site} storeId={receipt.storeId} /><Button className='primary' onClick={() => { void Taro.switchTab({ url: '/pages/orders/index' }) }}>{t("查看我的预约")}</Button></View></View></> : <View className='booking-wizard'>
      <View className='booking-header'>
      <View className='booking-header-top'><Text className='eyebrow'>YOUR MOMENT OF CARE</Text><LanguageSwitcher compact /></View><View className='heading'>{t("预约一段自在时光")}</View><View className='steps'>{steps.map((label, index) => <Button key={label} className={step === index ? 'active' : index < step ? 'done' : ''} disabled={busy || index > step} onClick={() => { if (index < step && !busy) setStep(index) }}><Text className='n'>{index < step ? '✓' : index + 1}</Text><Text>{t(label)}</Text></Button>)}</View><View className='step-intro'><Text className='step-count'>0{step + 1}</Text><View>{t(stepHints[step])}</View></View>
      </View>
      <ScrollView key={step} className='booking-content' scrollY enhanced bounces={false}>
        <View className='booking-content-inner'>
      {error && <View className='error-bar'>{t(error)}<Button onClick={retry}>{t("重试")}</Button></View>}
      {step === 0 && <>{profile?.memberVerified&&profile.phoneVerified&&<View className='banner'>{profile.memberStoreName?t('会员归属门店：{store}',{store:t(profile.memberStoreName)}):t('会员归属门店待核实，不影响预约。')}<View className='tiny'>{t('会员可选择其他门店预约；项目与接待按到店门店安排。')}</View></View>}{site.stores.filter(item => item.enabled).map(item => <View className={`choice ${storeId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { if (item.onlineBooking) changed(() => { setStoreId(item.id); setServices([]); setTeachers([]); setTime(''); setTeacherId('') }); else call(item.phone) }}><Image src={item.image} mode='aspectFill' /><View className='info'><View className='card-title'>{item.name}</View><View className='muted'>{item.address}</View><View className='tiny'>{item.onlineBooking ? item.hours : t('暂未开放线上预约，请致电咨询')}</View></View><Text className='check'>{storeId === item.id ? '✓' : '›'}</Text></View>)}</>}
      {step === 1 && <><View className='selection-note'>{store?.name}{t("· 本店开放项目")}</View>{servicesLoading ? <View className='empty'>{t("正在加载本店项目…")}</View> : services.map(item => <View className={`choice ${serviceId === item.id ? 'selected' : ''}`} key={item.id} onClick={() => changed(() => setServiceId(item.id))}><Image src={item.image} mode='aspectFill' /><View className='info'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><Text className='tiny'>{item.duration}</Text></View><Text className='check'>{serviceId === item.id ? '✓' : '›'}</Text></View>)}{!servicesLoading && !services.length && <View className='empty'>{t("本店暂无开放项目，请联系门店。")}</View>}</>}
      {step === 2 && <><View className='selection-note'>{store?.name} · {service?.name}</View><View className='two-fields'><View className='field'><View className='label'>{t("到店日期")}</View><Picker mode='date' value={date} start={day()} end={day(slots?.rules.advanceDays || 7)} disabled={busy} onChange={e => changed(() => { setDate(e.detail.value); setTime('') })}><View className='picker'>{date}　›</View></Picker></View><View className='field'><View className='label'>{t("同行人数")}</View><Picker range={counts} value={headcount - 1} onChange={e => changed(() => { setHeadcount(Number(e.detail.value) + 1); setTime('') })}><View className='picker'>{t('{count} 人', { count: headcount })}　›</View></Picker></View></View><View className='label'>{t("选择开始时间")}</View><View className='tiny'>{t('上海时间（UTC+8）')}</View>{slotsLoading && <View className='empty'>{t("正在查询名额…")}</View>}<View className='slot-grid'>{slots?.slots.map(item => <Button className={time === item.time ? 'active' : ''} key={item.time} disabled={!item.available || item.remaining < headcount} onClick={() => changed(() => setTime(item.time))}>{item.time}<Text className='tiny'>{item.available && item.remaining >= headcount ? t('余 {count} 位', { count: item.remaining }) : t('不可预约')}</Text></Button>)}</View>{!slotsLoading && !slots?.slots.length && <View className='empty'>{t("当日暂无可预约时段，请更换日期。")}</View>}<View className='banner'>{t("提交后需门店确认；调理师、房间与床位以门店安排为准。")}</View></>}
      {step === 3 && <>{signedIn && runtime.customerProfiles && <View className='banner'>{t("个人资料可用于快速填写预约。")}<Button className='secondary' onClick={() => { void Taro.navigateTo({ url: '/pages/profile/index' }) }}>{t("完善姓名与微信手机号")}</Button></View>}<View className='banner'>{store?.name} · {service?.name}<View>{date} {time} · {t('{count} 人同行', { count: headcount })}</View></View><View className='field'><View className='label'>{t("您的称呼")}</View><Input className='input' value={name} maxlength={40} disabled={busy} placeholder={t('请输入称呼')} onInput={e => changed(() => setName(e.detail.value))} /></View><View className='field'><View className='label'>{t("联系电话")}</View><Input className='input' type='number' value={phone} maxlength={11} disabled={busy} placeholder={t('便于门店确认预约')} onInput={e => changed(() => setPhone(e.detail.value))} /></View><View className='field therapist-field'><View className='label'>{t("调理师意向（非锁定安排）")}</View>{teachers.length > 0 ? <Picker range={teacherNames} value={teachers.findIndex(item => item.id === teacherId) + 1} disabled={busy || teachersLoading} onChange={e => changed(() => setTeacherId(teachers[Number(e.detail.value) - 1]?.id || ''))}><View className='picker'>{teacherNames[teachers.findIndex(item => item.id === teacherId) + 1]}　›</View></Picker> : <View className='picker therapist-unavailable'>{teachersLoading ? t('正在加载本店调理师…') : t('门店安排（不指定）')}</View>}<View className='therapist-note'>{teachersLoading ? t('正在查询本项目可选择的调理师。') : teacherError ? <>{t("调理师列表暂未加载，可重试或由门店安排。")}<Button className='text-link' disabled={busy} onClick={() => setTeacherRevision(value => value + 1)}>{t("重新加载调理师")}</Button></> : teachers.length ? t('仅记录您的意向，实际接待由门店确认。') : t('本项目暂未开放调理师意向，由门店为您安排。')}</View></View>{memberRecognized&&<View className='banner'>{t('已核实会员')}<View className='tiny'>{profile?.memberStoreName?t('会员归属门店：{store}',{store:t(profile.memberStoreName)}):t('会员归属门店待核实，不影响预约。')}</View>{profile?.memberStoreId&&profile.memberStoreId!==storeId&&<View className='tiny'>{t('本次为会员跨店预约')}</View>}</View>}<View className='two-fields'>{[...(!memberRecognized?[[t('是否会员'), member, setMember]]:[]), [t('是否到店过'), visited, setVisited]].map(([label, value, setter]) => <View className='field' key={t(String(label))}><View className='label'>{t(String(label))}</View><Picker range={claimNames.map(value => t(value))} value={Number(value)} disabled={busy} onChange={e => changed(() => (setter as (v: number) => void)(Number(e.detail.value)))}><View className='picker'>{t(claimNames[Number(value)])}　›</View></Picker></View>)}</View><View className='field'><View className='label'>{t("备注（选填）")}</View><Textarea value={remark} maxlength={500} disabled={busy} placeholder={t('请勿填写身份证、病历等不必要信息')} onInput={e => changed(() => setRemark(e.detail.value))} /></View><CheckboxGroup onChange={e => changed(() => setConsent(e.detail.value.includes('agree')))}><View className='agree'><Checkbox value='agree' checked={consent} disabled={busy} /><View className='agree-copy'>{t("同意为预约接待处理必要信息，已阅读")}<Button className='text-link' onClick={showPrivacy}>{t("《预约隐私说明》")}</Button></View></View></CheckboxGroup><CheckboxGroup onChange={e => changed(() => setSensitive(e.detail.value.includes('health')))}><View className='agree'><Checkbox value='health' checked={sensitive} disabled={busy} /><View className='agree-copy'>{t("如自愿提供健康信息，同意仅用于本次接待（选填）")}</View></View></CheckboxGroup></>}
        </View>
      </ScrollView>
      <View className='booking-footer'>
      <View className='bottom-actions'><CustomerService site={site} storeId={storeId} />{step > 0 && <Button className='secondary' disabled={busy} onClick={() => setStep(value => value - 1)}>{t("上一步")}</Button>}{step < 3 ? <Button className='primary' onClick={next}>{t("下一步 →")}</Button> : <Button className='primary' loading={busy} disabled={busy} onClick={() => { void submit() }}>{signedIn ? t('提交预约申请') : t('微信登录后提交')}</Button>}</View>
      </View>
    </View>}
    <CustomerLoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} onSignedIn={() => { setLoginOpen(false); setError('') }} />
  </View>
}
