import {useRef,useState} from 'react'
import {Button,Text,View} from '@tarojs/components'
import {isWeapp,subscribe} from '../services/api'
import './subscription-preferences.scss'

export type SubscriptionStatus={templates:{kind:string;title:string;templateId:string;ready:boolean;remaining:number;issue:string}[];items:{id:string;eventLabel:string;deliveryStatus:string;createdAt:string}[];development:boolean}
const states:Record<string,string>={PENDING:'等待发送',RETRY:'稍后重试',SENDING:'正在发送',ACCEPTED:'微信已受理',BLOCKED:'本次未发送',FAILED:'发送未成功',UNKNOWN:'发送结果待核实',CANCELLED:'预约已更新，旧通知已停止'}

export default function SubscriptionPreferences({status,onRefresh}:{status:SubscriptionStatus|null;onRefresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),sending=useRef(false)
  if(!isWeapp)return null
  const templates=status?.templates.filter(t=>t.ready&&t.templateId)||[]
  async function enable(){
    if(sending.current||!templates.length)return
    sending.current=true;setBusy(true);setFeedback('')
    try{
      // Keep this call before the first await: WeChat requires a direct user gesture.
      const result=await subscribe(templates.map(t=>t.templateId))
      setFeedback(result.error|| (result.recorded?'订阅已保存，门店处理预约后将按授权次数提醒。':'本次未开启订阅，你仍可在这里查看预约状态。'))
      await onRefresh()
    }finally{sending.current=false;setBusy(false)}
  }
  return <View className='subscription-preferences'>
    <View className='subscription-heading'><Text>预约消息提醒</Text><Text className='subscription-label'>微信订阅</Text></View>
    <Text className='subscription-intro'>让门店确认结果和到店时间，及时提醒你。</Text>
    {!status&&<View className='subscription-note'>提醒状态暂时无法加载，请稍后下拉刷新。</View>}
    {status?.templates.map(t=><View className='subscription-template-row' key={t.kind}><View><Text className='subscription-title'>{t.title}</Text><Text className='subscription-description'>{t.kind==='result'?'确认、取消、改期等处理结果':'确认后的到店前提醒'}</Text></View><Text className={`subscription-balance ${t.ready&&t.remaining>0?'available':''}`}>{!t.ready?'暂未就绪':t.remaining>0?`已记录 ${t.remaining} 次`:'待订阅'}</Text></View>)}
    {status?.templates.some(t=>!t.ready)&&<View className='subscription-note'>{status.development?'模拟登录无法接收真实微信消息，请用客户微信在真机测试。':'部分提醒正在准备中；预约状态仍可正常查看。'}</View>}
    {!!templates.length&&<Button className='primary' disabled={busy} loading={busy} onClick={()=>{void enable()}}>{busy?'正在保存…':'订阅预约及到店提醒'}</Button>}
    {feedback&&<View className='subscription-feedback'>{feedback}</View>}
    <View className='subscription-note'>每个模板单独授权、使用一次。上方次数为本系统记录，实际发送以微信授权为准；不订阅也可正常预约。</View>
    {!!status?.items.length&&<View className='subscription-history'><Text className='subscription-history-title'>最近的提醒</Text>{status.items.slice(0,3).map(item=><View className='subscription-history-row' key={item.id}><Text>{item.eventLabel}</Text><Text>{states[item.deliveryStatus]||'等待更新'}</Text></View>)}</View>}
  </View>
}
