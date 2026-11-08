import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow, useRouter, useUnload } from '@tarojs/taro'
import { Button, Picker, ScrollView, Text, Textarea, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import { CustomerLoginSheet } from '../../components/CustomerLogin'
import { hasCustomerSession, request } from '../../services/api'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import { loadSite, themeStyle } from '../../services/site'
import { mergeMessages, message, newId, RequestScope } from '../../utils/booking'
import type { ChatConversation, ChatMessage, MessagePage, Site } from '../../types'
import './index.scss'

export default function Chat() {
  const { params } = useRouter()
  const signedIn = useCustomerSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const previousSignIn = useRef(signedIn)
  const [site, setSite] = useState<Site | null>(null), [storeId, setStoreId] = useState(params.storeId || ''), [conversation, setConversation] = useState(''), [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [hasOlder, setHasOlder] = useState(false), [olderBusy, setOlderBusy] = useState(false)
  const visible = useRef(false), scope = useRef(new RequestScope()), cursor = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), key = useRef(newId()), sending = useRef(false), currentStore = useRef(storeId)
  const [session, setSession] = useState<ChatConversation | null>(null)
  const ended = session?.status === 'RESOLVED'
  const valid = (version: number) => visible.current && scope.current.valid(version)
  const stores = site?.stores.filter(item => item.enabled) || [], names = ['品牌客服 · 总部接待', ...stores.map(item => item.name)]
  async function poll(version: number, id: string) {
    try { const result = await request<MessagePage>(`/api/me/chats/${id}/messages?after=${cursor.current}`); if (!valid(version)) return; if (result.conversation) setSession(result.conversation); if (!cursor.current) setHasOlder(result.items.length === 100); setMessages(old => mergeMessages(old, result.items)); if (result.items.length) cursor.current = Math.max(cursor.current, result.items[result.items.length - 1].seq); setError('') }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) timer.current = setTimeout(() => { void poll(version, id) }, 5000 + Math.random() * 1000) }
  }
  async function open(id: string) {
    clearTimeout(timer.current); const version = scope.current.next(); cursor.current = 0; currentStore.current = id; setStoreId(id); setConversation(''); setSession(null); setMessages([]); setDraft(''); key.current = newId(); sending.current = false; setBusy(false); setLoading(true); setHasOlder(false); setOlderBusy(false); setError('')
    if (!hasCustomerSession()) { setLoading(false); return }
    try { const result = await request<ChatConversation>('/api/me/chats', { method: 'POST', data: { storeId: id } }); if (!valid(version)) return; setConversation(result.id); setSession(result); setLoading(false); await poll(version, result.id) }
    catch (e) { if (valid(version)) { setLoading(false); setError(message(e)) } }
  }
  function stop() { visible.current = false; scope.current.cancel(); clearTimeout(timer.current) }
  useDidShow(() => {
    visible.current = true; const version = scope.current.next()
    loadSite().then(result => { if (!valid(version)) return; setSite(result); const id = result.stores.some(item => item.enabled && item.id === currentStore.current) ? currentStore.current : ''; void open(id) }).catch(e => { if (valid(version)) { setLoading(false); setError(message(e)) } })
  }); useDidHide(stop); useUnload(stop)
  useEffect(() => {
    if (previousSignIn.current && !signedIn) { scope.current.cancel(); clearTimeout(timer.current); setConversation(''); setSession(null); setMessages([]); setLoading(false) }
    if (!previousSignIn.current && signedIn && visible.current) void open(currentStore.current)
    previousSignIn.current = signedIn
  }, [signedIn])
  async function send() {
    if (sending.current || ended || !conversation || !draft.trim()) return
    const version = scope.current.snapshot(); sending.current = true; setBusy(true); setError('')
    try { await request(`/api/me/chats/${conversation}/messages`, { method: 'POST', data: { content: draft.trim(), clientKey: key.current } }); if (!valid(version)) return; setDraft(''); key.current = newId(); const result = await request<MessagePage>(`/api/me/chats/${conversation}/messages?after=${cursor.current}`); if (valid(version)) { setMessages(old => mergeMessages(old, result.items)); if (result.conversation) setSession(result.conversation) } }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) { sending.current = false; setBusy(false) } }
  }
  async function older() {
    if (olderBusy || !messages.length || !conversation) return
    const id = conversation, version = scope.current.snapshot(); setOlderBusy(true)
    try { const result = await request<MessagePage>(`/api/me/chats/${id}/messages?before=${messages[0].seq}`); if (valid(version)) { setMessages(old => mergeMessages(old, result.items)); setHasOlder(result.items.length === 100) } }
    catch (e) { if (valid(version)) setError(message(e)) }
    finally { if (valid(version)) setOlderBusy(false) }
  }
  async function restart() {
    if (sending.current || !conversation || !ended) return
    clearTimeout(timer.current); const version = scope.current.next(), previous = conversation; sending.current = true; setBusy(true); setError('')
    try {
      const result = await request<ChatConversation>(`/api/me/chats/${previous}/restart`, { method: 'POST' })
      if (!valid(version)) return
      cursor.current = 0; key.current = newId(); setDraft(''); setMessages([]); setHasOlder(false); setOlderBusy(false); setConversation(result.id); setSession(result); await poll(version, result.id)
    } catch (e) { if (valid(version)) { setError(message(e)); timer.current = setTimeout(() => { void poll(version, previous) }, 5000) } }
    finally { if (valid(version)) { sending.current = false; setBusy(false) } }
  }
  return <View className='page chat-page' style={themeStyle(site)}><View className='chat-heading'><Text className='eyebrow'>WE ARE HERE FOR YOU</Text><View className='heading'>与门店说说您的需要</View><View className='muted'>预约、项目和到店安排，都可以在这里咨询。</View></View><View className='chat-store'><Picker range={names} value={stores.findIndex(item => item.id === storeId) + 1} disabled={busy} onChange={e => { void open(stores[Number(e.detail.value) - 1]?.id || '') }}><View className='chat-store-row'><Text className='store-label'>接待门店</Text><Text className='store-value'>{names[stores.findIndex(item => item.id === storeId) + 1]}　›</Text></View></Picker></View>{error && <View className='chat-error'>{error}<Button onClick={() => { void open(storeId) }}>重新连接</Button></View>}
    {!signedIn ? <View className='chat-login-card'><View className='empty-title'>登录后，与门店安心沟通</View><View className='muted'>登录用于识别您的客户账号，<Text>方便保存咨询记录与接待安排。</Text></View><Button className='primary' onClick={() => setLoginOpen(true)}>微信登录，开始咨询</Button><View className='tiny'>也可使用底部的“更多联系方式”联系门店。</View></View> : <>
    {session && <View className={`chat-session ${ended ? 'ended' : ''}`}>{ended ? '本次咨询已结束，聊天记录已保留。' : session.status === 'ACTIVE' ? `${session.assignedAdminName || '门店客服'}正在为您接待` : '等待门店接入，您可以先留下问题。'}</View>}
    <ScrollView className='chat-messages' scrollY scrollIntoView={messages.length ? `message-${messages[messages.length - 1].id}` : ''} scrollWithAnimation>{hasOlder && <Button className='history' loading={olderBusy} disabled={olderBusy} onClick={() => { void older() }}>查看更早消息</Button>}{!messages.length && <View className='chat-empty'><View className='chat-empty-icon'><View /><View /><View /></View><View className='empty-title'>{loading ? '正在连接门店…' : error ? '连接暂时中断' : '随时为您解答'}</View><View>{loading ? '稍等片刻，即可开始咨询。' : error ? '请重新连接后继续咨询。' : '留下您的问题，门店工作人员会在这里回复。'}</View></View>}{messages.map(item => <View id={`message-${item.id}`} key={item.id} className={`message-row ${item.direction === 'IN' ? 'mine' : ''}`}><View className='bubble'><View className='message-meta'>{item.direction === 'IN' ? '我' : item.senderName || '门店客服'} · {item.createdAt.replace('T', ' ').slice(5, 16)}</View><Text>{item.content}</Text></View></View>)}<View className='message-bottom' /></ScrollView>
    {ended ? <View className='chat-ended'><Text>还有其他问题？可以发起一次新的咨询。</Text><Button className='primary' loading={busy} disabled={busy} onClick={() => { void restart() }}>发起新咨询</Button></View> : <View className='chat-compose'><Textarea value={draft} maxlength={2000} disabled={busy || !conversation} placeholder='请输入咨询内容' onInput={e => { setDraft(e.detail.value); key.current = newId() }} /><Button className='primary' loading={busy} disabled={busy || !conversation || !draft.trim()} onClick={() => { void send() }}>发送</Button></View>}</>}
    <View className='chat-contact-footer'><CustomerService site={site} storeId={storeId} showOnline={false} label='更多联系方式' /></View>
    <CustomerLoginSheet open={loginOpen} onClose={() => setLoginOpen(false)} onSignedIn={() => setLoginOpen(false)} />
  </View>
}
