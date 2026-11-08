import {Text,View} from '@tarojs/components'
import {isWeapp} from '../services/api'

export default function BookingSubscriptionNotice({result,reminder}:{result:boolean;reminder:boolean}){
  if(!isWeapp||!result&&!reminder)return null
  return <View className='booking-subscriptions'>
    <View className='booking-subscriptions-heading'>预约消息提醒<Text>微信订阅</Text></View>
    {result&&<View className='booking-subscriptions-row'><Text>预约处理提醒</Text><Text>门店确认、改期或取消结果</Text></View>}
    {reminder&&<View className='booking-subscriptions-row'><Text>预约提醒</Text><Text>确认后的到店前提醒</Text></View>}
    <Text className='booking-subscriptions-note'>点击提交后，可在微信弹窗中分别选择是否接收。每项允许发送一次，拒绝不影响预约。</Text>
  </View>
}
