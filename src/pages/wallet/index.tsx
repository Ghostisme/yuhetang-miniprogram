import { withLaunchNotice } from '../../components/LaunchNotice'
import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import { useI18n, t, dialogLabels } from '../../i18n'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import { useMemberWallet } from '../../hooks/useMemberWallet'
import { request } from '../../services/api'
import type { CustomerProfile } from '../../types'
import MemberSyncStatus from '../../components/MemberSyncStatus'
import './index.scss'

type Entry={id:string;kind:string;deltaFen:number;balanceAfterFen:number;businessAt:string}
type ServiceBinding={available:boolean;bound:boolean}
const kinds:Record<string,string>={OPENING:'期初余额',RECHARGE:'充值',CONSUME:'消费',REVERSAL:'冲正'}
const money=(fen:number)=>(fen/100).toFixed(2)

function WalletPage(){
  const {locale}=useI18n(),signedIn=useCustomerSession()
  const [profile,setProfile]=useState<CustomerProfile|null>(null)
  const {lookup,loading:walletLoading,error:walletError,fetchedAt,refresh}=useMemberWallet(signedIn&&!!profile?.phoneVerified)
  const accounts=lookup?.accounts||[]
  const [selected,setSelected]=useState(''),[entries,setEntries]=useState<Entry[]>([]),[page,setPage]=useState(1),[total,setTotal]=useState(0)
  const [service,setService]=useState<ServiceBinding|null>(null),[command,setCommand]=useState(''),[expires,setExpires]=useState(0),[clock,setClock]=useState(Date.now())
  const [serviceExpanded,setServiceExpanded]=useState(false),[serviceError,setServiceError]=useState(''),[serviceLoading,setServiceLoading]=useState(false),[pageVisible,setPageVisible]=useState(true)
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[entryError,setEntryError]=useState('')
  const version=useRef(0),entryVersion=useRef(0),serviceVersion=useRef(0),sending=useRef(false),alive=useRef(true)
  async function load(){
    if(!signedIn)return;const current=++version.current;setLoading(true)
    try{
      const own=await request<CustomerProfile>('/api/me/profile');if(version.current!==current)return;setProfile(own)
      setError('')
    }catch(cause){if(version.current===current)setError((cause as Error).message)}finally{if(version.current===current)setLoading(false)}
  }
  async function loadService(){
    if(!signedIn||!profile?.phoneVerified)return
    const current=++serviceVersion.current;setServiceLoading(true)
    try{const binding=await request<ServiceBinding>('/api/me/wallet-service');if(current===serviceVersion.current){setService(binding);setServiceError('')}}catch(cause){if(current===serviceVersion.current)setServiceError((cause as Error).message)}finally{if(current===serviceVersion.current)setServiceLoading(false)}
  }
  async function loadEntries(){
    const current=++entryVersion.current;if(!selected){setEntries([]);setTotal(0);return}
    try{const result=await request<{items:Entry[];total:number}>(`/api/me/wallets/${selected}/entries?page=${page}`);if(current===entryVersion.current){setEntries(result.items);setTotal(result.total);setEntryError('')}}catch(cause){if(current===entryVersion.current)setEntryError((cause as Error).message)}
  }
  const selectedVersion=accounts.find(account=>account.id===selected)?.version
  useEffect(()=>{if(signedIn)void load();else{setProfile(null);setSelected('');setEntries([]);setCommand('');setService(null);setServiceExpanded(false)}return()=>{version.current++;entryVersion.current++;serviceVersion.current++}},[signedIn])
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;version.current++;entryVersion.current++;serviceVersion.current++}},[])
  useDidShow(()=>{setPageVisible(true);void load();if(serviceExpanded)void loadService()})
  useDidHide(()=>{setPageVisible(false);version.current++;entryVersion.current++;serviceVersion.current++})
  useEffect(()=>{setSelected(previous=>accounts.some(a=>a.id===previous)?previous:accounts[0]?.id||'')},[lookup])
  useEffect(()=>{setPage(1)},[selected])
  useEffect(()=>{if(!pageVisible)return;setEntries([]);void loadEntries();return()=>{entryVersion.current++}},[selected,page,selectedVersion,pageVisible])
  useEffect(()=>{if(!command||!pageVisible)return;setClock(Date.now());const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[command,pageVisible])
  function refreshBalance(){void refresh();void loadEntries()}
  async function issue(){
    if(sending.current)return;sending.current=true;setBusy(true);setServiceError('')
    try{const result=await request<{command:string;expiresAt:string}>('/api/me/wallet-service/code',{method:'POST'});if(alive.current){setCommand(result.command);setExpires(Date.parse(result.expiresAt));setClock(Date.now())}}catch(cause){if(alive.current)setServiceError((cause as Error).message)}finally{sending.current=false;if(alive.current)setBusy(false)}
  }
  async function unbind(){
    if(sending.current)return;const confirm=await Taro.showModal({title:t('解除服务号绑定'),content:t('解绑后，服务号将停止返回您的会员余额。小程序内仍可查询。'),...dialogLabels()});if(!confirm.confirm)return
    sending.current=true;setBusy(true)
    try{await request('/api/me/wallet-service',{method:'DELETE'});if(alive.current){setCommand('');await loadService()}}catch(cause){if(alive.current)setServiceError((cause as Error).message)}finally{sending.current=false;if(alive.current)setBusy(false)}
  }
  const chosen=accounts.find(a=>a.id===selected),seconds=Math.max(0,Math.ceil((expires-clock)/1000))
  const sourceWaiting=lookup?.sourceSync?.enabled&&!lookup.sourceSync.lastSuccess&&['WAITING','SYNCING'].includes(lookup.sourceSync.state)
  const membershipPending=lookup?.lookupStatus==='MEMBERSHIP_PENDING'||(!lookup?.lookupStatus&&!(lookup?.memberVerified??profile?.memberVerified))
  if(!signedIn)return <View className={`page wallet-page locale-${locale}`}><CustomerLoginHero onSignedIn={()=>{}}/></View>
  return <View className={`page wallet-page locale-${locale}`}><View className='wallet-header'><View className='customer-heading-top'><Text className='eyebrow'>YOUR MEMBERSHIP</Text><LanguageSwitcher compact/></View><View className='heading'>{t('会员余额')}</View><Text className='wallet-caption'>{t('各门店账户分别记录，充值与消费有迹可查。')}</Text>{profile?.phoneVerified&&<View className='wallet-live-bar'><View><Text className='wallet-live-status'>{t('自动读取最新已同步数据')}</Text>{fetchedAt>0&&<Text className='wallet-query-time'>{t('查询于 {time}',{time:new Date(fetchedAt).toLocaleTimeString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-GB')})}</Text>}</View><Button className='wallet-link wallet-refresh' disabled={walletLoading} onClick={refreshBalance}>{t(walletLoading?'查询中…':'刷新余额')}</Button></View>}</View>
    <ScrollView scrollY className='wallet-scroll'><View className='wallet-content'><MemberSyncStatus sync={lookup?.sourceSync}/>
      <Button className='wallet-consumption-entry' onClick={()=>{void Taro.navigateTo({url:'/pages/consumption/index'})}}><View className='wallet-account-top'><Text>{t('消费记录')}</Text><Text>›</Text></View><Text className='wallet-account-label'>{t('查看消费门店、项目、金额与时间')}</Text></Button>
      {error&&<View className='wallet-error' role='alert'>{t(error)}<Button className='secondary' onClick={()=>{void load()}}>{t('重新加载')}</Button></View>}
      {walletError&&<View className='wallet-error wallet-balance-error' role='alert'>{t(lookup?'余额暂未更新，当前显示上次查询结果。':walletError)}<Button className='secondary' onClick={refreshBalance}>{t('重新加载')}</Button></View>}
      {loading&&!profile&&<View className='wallet-empty'>{t('正在加载…')}</View>}
      {profile&&!profile.phoneVerified&&<View className='wallet-verify'><View className='wallet-section-title'>{t('先验证您的手机号')}</View><Text>{t('授权手机号后，仅显示与您的客户档案关联的余额。')}</Text><CustomerProfileCard showWallet={false} onChanged={next=>{setProfile(next);if(next.phoneVerified)void load()}}/></View>}
      {profile?.phoneVerified&&<>
        {walletLoading&&!lookup&&<View className='wallet-empty'>{t('正在查询余额…')}</View>}
        {lookup&&!accounts.length&&<View className='wallet-empty'><View className='wallet-section-title'>{t(sourceWaiting?'正在查询原系统会员卡':membershipPending?'会员资料待核实':'余额待迁移核对')}</View><Text>{t(sourceWaiting?'已验证您的手机号，后台正在关联会员卡和近期消费，完成后自动显示。':membershipPending?'会员资料正在分批迁移，暂未查到记录不代表非会员或余额为零，请联系门店核实。':'暂未录入不代表余额为零，请联系门店核对原会员账户。')}</Text><Text className='wallet-caption'>{t('账户迁入后可直接查询，无需重新绑定服务号。')}</Text></View>}
        {!!accounts.length&&<View className='wallet-hint wallet-migration-note'>{t(lookup?.balanceScope==='LOCAL_AND_SOURCE_CARDS'?'按卡号与所属门店分别展示，已迁入账户优先，不重复累计。':'当前仅显示已迁入并核对的账户，其他账户请联系门店核实。')}</View>}
        {accounts.map(account=><Button key={account.id} className={`wallet-account ${selected===account.id?'is-selected':''}`} onClick={()=>{setSelected(account.id);setPage(1)}}><View className='wallet-account-top'><Text>{t(account.storeName)}</Text><Text>{selected===account.id?'✓':'›'}</Text></View><Text className='wallet-account-label'>{t(account.label)}{account.source==='KU52'?' · '+t('原系统同步'):''}</Text>{account.cardNumber&&<Text className='wallet-card-number'>{t('卡号')} {account.cardNumber}</Text>}<View className='wallet-amount'><Text className='wallet-currency'>¥</Text>{money(account.balanceFen)}</View>{account.validity&&<View className='wallet-validity'>{t('有效期')} {account.validity}</View>}<View className='wallet-updated'>{t('更新于 {time}',{time:new Date(account.updatedAt).toLocaleString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-GB')})}</View></Button>)}
        {chosen&&<View className='wallet-section'><View className='wallet-section-heading'><View className='wallet-section-title'>{t('余额明细')}</View><Button className='wallet-link' onClick={refreshBalance}>{t('刷新')}</Button></View><Text className='wallet-caption'>{t(chosen.storeName)} · {t(chosen.label)}</Text>{chosen.source==='KU52'&&<View className='wallet-hint'>{t('原系统卡为同步查询数据，消费详情请查看消费记录。')}</View>}{entryError&&<View className='wallet-error' role='alert'>{t(entryError)}<Button className='secondary' onClick={()=>{void loadEntries()}}>{t('重试')}</Button></View>}{entries.map(entry=><View className='wallet-entry' key={entry.id}><View className='wallet-entry-top'><Text>{t(kinds[entry.kind]||entry.kind)}</Text><Text className={entry.deltaFen<0?'wallet-debit':'wallet-credit'}>{entry.deltaFen>0?'+':''}¥{money(entry.deltaFen)}</Text></View><View className='wallet-entry-meta'><Text>{new Date(entry.businessAt).toLocaleString(locale==='zh'?'zh-CN':locale==='ja'?'ja-JP':'en-GB')}</Text><Text>{t('余额')} ¥{money(entry.balanceAfterFen)}</Text></View></View>)}{total>20&&<View className='wallet-pagination'><Button className='secondary' disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t('上一页')}</Button><Text>{page} / {Math.ceil(total/20)}</Text><Button className='secondary' disabled={page*20>=total} onClick={()=>setPage(p=>p+1)}>{t('下一页')}</Button></View>}</View>}
        <View className='wallet-section wallet-service-section'><Button className='wallet-service-toggle' onClick={()=>{setServiceExpanded(!serviceExpanded);if(!serviceExpanded)void loadService()}}><Text>{t('服务号查询（可选）')}</Text><Text>{serviceExpanded?'−':'+'}</Text></Button><Text className='wallet-caption'>{t('小程序内可直接查余额，无需绑定或发送消息。')}</Text>
          {serviceExpanded&&<View className='wallet-service-body'>{service?.bound&&<Text className='wallet-bound'>{t('已绑定')}</Text>}<Text className='wallet-caption'>{t('绑定后，在裕和堂服务号发送“余额”即可查询。')}</Text>{serviceError?<View className='wallet-error wallet-service-error' role='alert'>{t(serviceError)}<Button className='secondary' onClick={()=>{void loadService()}}>{t('重试')}</Button></View>:serviceLoading?<View className='wallet-hint'>{t('正在加载…')}</View>:!service?.available?<View className='wallet-hint'>{t('服务号余额查询暂未启用，小程序内仍可查看已录入余额。')}</View>:<><View className='wallet-hint'>{t('绑定口令仅用于关联您本人的会员档案，请勿转发给他人。')}</View>{command&&<View className='wallet-command'><Text selectable>{command}</Text><Text className='wallet-caption'>{seconds>0?t('{seconds} 秒后失效',{seconds}):t('口令已失效，请重新生成')}</Text><Button className='secondary' disabled={seconds===0} onClick={()=>{void Taro.setClipboardData({data:command})}}>{t('复制口令')}</Button><Text className='wallet-caption'>{t('打开裕和堂服务号，将完整口令粘贴到消息输入框并发送。')}</Text></View>}<Button className='primary' loading={busy} disabled={busy} onClick={()=>{void issue()}}>{service.bound?t('重新生成绑定口令'):t('生成绑定口令')}</Button>{service.bound&&<Button className='wallet-link' disabled={busy} onClick={()=>{void unbind()}}>{t('解除服务号绑定')}</Button>}<Button className='wallet-link' disabled={busy} onClick={()=>{setCommand('');void loadService()}}>{t('已发送口令，刷新绑定状态')}</Button></>}</View>}
        </View>
      </>}
      <View className='wallet-footnote'>{t('余额按人民币展示，由门店登记维护。对金额有疑问请联系门店核对。')}</View>
    </View></ScrollView>
  </View>
}

export default withLaunchNotice(WalletPage)
