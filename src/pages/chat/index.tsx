import { withLaunchNotice } from '../../components/LaunchNotice'
import { localizeSite } from '../../i18n/content'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import OptionSelect from '../../components/OptionSelect'
import { t, useI18n } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow, useRouter, useUnload } from '@tarojs/taro'
import { Button, ScrollView, Text, Textarea, View } from '@tarojs/components'
import CustomerService, { ContactChannels } from '../../components/CustomerService'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginSheet } from '../../components/CustomerLogin'
import { hasCustomerSession, request } from '../../services/api'
import { useCustomerChatAccess } from '../../hooks/useCustomerChatAccess'
import { loadSite, themeStyle } from '../../services/site'
import { mergeMessages, message, newId, RequestScope } from '../../utils/booking'
import type { ChatConversation, ChatMessage, MessagePage, Site } from '../../types'
import './index.scss'
import ChatAttachment from '../../components/ChatAttachment'

function Chat() {
  const { locale } = useI18n()
  const { params } = useRouter()
  const access = useCustomerChatAccess(), signedIn = access.signedIn
  const nativeChannel = params.channel === 'wechat'
  const accessReady = useRef(access.ready); accessReady.current = access.ready
  const [loginOpen, setLoginOpen] = useState(false)
  const [rawSite, setSite] = useState<Site | null>(null), [storeId, setStoreId] = useState(params.storeId || ''), [conversation, setConversation] = useState(''), [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [hasOlder, setHasOlder] = useState(false), [olderBusy, setOlderBusy] = useState(false)
  const site = rawSite ? localizeSite(rawSite, locale) : null
  const visible = useRef(false), siteVersion = useRef(0), scope = useRef(new RequestScope()), cursor = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), key = useRef(newId()), sending = useRef(false), currentStore = useRef(storeId)
  const [session, setSession] = useState<ChatConversation | null>(null)
  const ended = session?.status === 'RESOLVED'
  const valid = (version: number) => visible.current && scope.current.valid(version)
  const stores = site?.stores.filter(item => item.enabled) || [], names = [t('品牌客服 · 总部接待'), ...stores.map(item => item.name)]
  async function poll(version: number, id: string) {
    try { const result = await request<MessagePage>(`/api/me/chats/${id}/messages?after=${cursor.current}`); if (!valid(version)) return; if (result.conversation) setSession(result.conversation); if (!cursor.current) setHasOlder(result.items.length === 100); setMessages(old => mergeMessages(old, result.items)); if (result.items.length) cursor.current = Math.max(cursor.current, result.items[result.items.length - 1].seq); setError('') }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) timer.current = setTimeout(() => { void poll(version, id) }, 5000 + Math.random() * 1000) }
  }
  async function open(id: string) {
    clearTimeout(timer.current); const version = scope.current.next(); cursor.current = 0; currentStore.current = id; setStoreId(id); setConversation(''); setSession(null); setMessages([]); setDraft(''); key.current = newId(); sending.current = false; setBusy(false); setLoading(true); setHasOlder(false); setOlderBusy(false); setError('')
    if (!hasCustomerSession() || !accessReady.current || nativeChannel) { setLoading(false); return }
    try { const result = await request<ChatConversation>('/api/me/chats', { method: 'POST', data: { storeId: id } }); if (!valid(version)) return; setConversation(result.id); setSession(result); setLoading(false); await poll(version, result.id) }
    catch (e) { if (valid(version)) { setLoading(false); setError(message(e)) } }
  }
  function stop() { visible.current = false; siteVersion.current++; scope.current.cancel(); clearTimeout(timer.current) }
  useDidShow(() => {
    visible.current = true; const version = ++siteVersion.current
    loadSite().then(result => { if (!visible.current || version !== siteVersion.current) return; currentStore.current = result.stores.some(item => item.enabled && item.id === currentStore.current) ? currentStore.current : ''; setStoreId(currentStore.current); setSite(result) }).catch(e => { if (visible.current && version === siteVersion.current) { setLoading(false); setError(message(e)) } })
  }); useDidHide(stop); useUnload(stop)
  useEffect(() => {
    if (!access.ready) { scope.current.cancel(); clearTimeout(timer.current); setConversation(''); setSession(null); setMessages([]); setLoading(false); sending.current = false; setBusy(false) }
    else if (visible.current && rawSite && !nativeChannel) void open(currentStore.current)
  }, [access.ready, rawSite, nativeChannel])
  async function send() {
    if (!accessReady.current || sending.current || ended || !conversation || !draft.trim()) return
    const version = scope.current.snapshot(); sending.current = true; setBusy(true); setError('')
    try { await request(`/api/me/chats/${conversation}/messages`, { method: 'POST', data: { content: draft.trim(), clientKey: key.current } }); if (!valid(version)) return; setDraft(''); key.current = newId(); const result = await request<MessagePage>(`/api/me/chats/${conversation}/messages?after=${cursor.current}`); if (valid(version)) { setMessages(old => mergeMessages(old, result.items)); if (result.conversation) setSession(result.conversation) } }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) { sending.current = false; setBusy(false) } }
  }
  async function older() {
    if (!accessReady.current || olderBusy || !messages.length || !conversation) return
    const id = conversation, version = scope.current.snapshot(); setOlderBusy(true)
    try { const result = await request<MessagePage>(`/api/me/chats/${id}/messages?before=${messages[0].seq}`); if (valid(version)) { setMessages(old => mergeMessages(old, result.items)); setHasOlder(result.items.length === 100) } }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) setOlderBusy(false) }
  }
  async function restart() {
    if (!accessReady.current || sending.current || !conversation || !ended) return
    clearTimeout(timer.current); const version = scope.current.next(), previous = conversation; sending.current = true; setBusy(true); setError('')
    try {
      const result = await request<ChatConversation>(`/api/me/chats/${previous}/restart`, { method: 'POST' })
      if (!valid(version)) return
      cursor.current = 0; key.current = newId(); setDraft(''); setMessages([]); setHasOlder(false); setOlderBusy(false); setConversation(result.id); setSession(result); await poll(version, result.id)
    } catch (e) { if (valid(version)) { setError(message(e)); timer.current = setTimeout(() => { void poll(version, previous) }, 5000) } }
    finally { if (valid(version)) { sending.current = false; setBusy(false) } }
  }
  return <View className={`page chat-page locale-${locale}`} style={themeStyle(site)}><LanguageSwitcher /><View className='chat-heading'><Text className='eyebrow'>WE ARE HERE FOR YOU</Text><View className='heading'>{t("与门店说说您的需要")}</View><View className='muted'>{t("预约、项目和到店安排，都可以在这里咨询。")}</View></View><View className='chat-store'><OptionSelect title={t('接待门店')} options={names} value={stores.findIndex(item => item.id === storeId) + 1} disabled={busy || !access.ready} onChange={index => { void open(stores[index - 1]?.id || '') }}><View className='chat-store-row'><Text className='store-label'>{t("接待门店")}</Text><Text className='store-value'>{names[stores.findIndex(item => item.id === storeId) + 1]}　›</Text></View></OptionSelect></View>{error && <View className='chat-error'>{t(error)}<Button onClick={() => { void open(storeId) }}>{t("重新连接")}</Button></View>}
    {!signedIn ? <View className='chat-login-card'><View className='empty-title'>{t("登录后，与门店安心沟通")}</View><View className='muted'>{t("登录后还需填写姓名并授权手机号，")}<Text>{t("方便保存咨询记录与接待安排。")}</Text></View><Button className='primary' onClick={() => setLoginOpen(true)}>{t("微信登录，开始咨询")}</Button><View className='tiny'>{t("不授权也可通过电话联系门店。")}</View></View> : !access.ready ? <ScrollView className='chat-profile-scroll' scrollY><View className='chat-profile-gate'>
      <View className='empty-title'>{t("完善资料后，开始咨询")}</View><View className='muted'>{t("请填写姓名或称呼，并授权微信手机号，方便门店确认您的身份和跟进咨询。")}</View>
      {access.checking ? <View className='chat-access-loading'>{t("正在核对客户资料…")}</View> : access.error ? <View className='chat-error'>{t(access.error)}<Button onClick={() => { void access.refresh() }}>{t("重新加载")}</Button></View> : <CustomerProfileCard showWallet={false} requirePhone onChanged={access.changed} />}
      <Text className='tiny'>{t("拒绝手机号授权时，不会创建客服会话；您仍可电话联系门店。")}</Text>
    </View></ScrollView> : nativeChannel ? <ScrollView className='chat-profile-scroll' scrollY><View className='chat-profile-gate'>
      <View className='empty-title'>{t("客户资料已确认")}</View><View className='muted'>{t("点击微信客服，开始与门店沟通。")}</View>
      <View className='chat-verified-profile'><Text>{access.profile?.name}</Text><Text>{access.profile?.phone}</Text></View>
      {site && <ContactChannels site={site} storeId={storeId} showOnline={false} />}
    </View></ScrollView> : <>
    {session && <View className={`chat-session ${ended ? 'ended' : ''}`}>{ended ? t('本次咨询已结束，聊天记录已保留。') : session.status === 'ACTIVE' ? t('{name}正在为您接待', { name: session.assignedAdminName || t('门店客服') }) : t('等待门店接入，您可以先留下问题。')}</View>}
    <ScrollView className='chat-messages' scrollY scrollIntoView={messages.length ? `message-${messages[messages.length - 1].id}` : ''} scrollWithAnimation>{hasOlder && <Button className='history' loading={olderBusy} disabled={olderBusy} onClick={() => { void older() }}>{t("查看更早消息")}</Button>}{!messages.length && <View className='chat-empty'><View className='chat-empty-icon'><View /><View /><View /></View><View className='empty-title'>{loading ? t('正在连接门店…') : error ? t('连接暂时中断') : t('随时为您解答')}</View><View>{loading ? t('稍等片刻，即可开始咨询。') : error ? t('请重新连接后继续咨询。') : t('留下您的问题，门店工作人员会在这里回复。')}</View></View>}{messages.map(item => <View id={`message-${item.id}`} key={item.id} className={`message-row ${item.direction === 'IN' ? 'mine' : ''}`}><View className='bubble'><View className='message-meta'>{item.direction === 'IN' ? t('我') : item.senderName || t('门店客服')} · {item.createdAt.replace('T', ' ').slice(5, 16)}</View><ChatAttachment message={item} /></View></View>)}<View className='message-bottom' /></ScrollView>
    {ended ? <View className='chat-ended'><Text>{t("还有其他问题？可以发起一次新的咨询。")}</Text><Button className='primary' loading={busy} disabled={busy} onClick={() => { void restart() }}>{t("发起新咨询")}</Button></View> : <View className='chat-compose'><Textarea value={draft} maxlength={2000} disabled={busy || !conversation} placeholder={t('请输入咨询内容')} onInput={e => { setDraft(e.detail.value); key.current = newId() }} /><Button className='primary' loading={busy} disabled={busy || !conversation || !draft.trim()} onClick={() => { void send() }}>{t("发送")}</Button></View>}</>}
    <View className='chat-contact-footer'><CustomerService site={site} storeId={storeId} showOnline={false} label={t('更多联系方式')} /></View>
    <CustomerLoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} onSignedIn={() => setLoginOpen(false)} />
  </View>
}

export default withLaunchNotice(Chat)
