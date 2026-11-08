import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import './index.scss'

export default function Profile() {
  const signedIn = useCustomerSession()
  return <View className='page profile-page'>{signedIn ? <View className='section'><Text className='eyebrow'>YOUR PROFILE</Text><View className='heading'>个人资料</View><CustomerProfileCard /><Button className='secondary' onClick={() => { if (Taro.getCurrentPages().length > 1) void Taro.navigateBack(); else void Taro.switchTab({ url: '/pages/orders/index' }) }}>返回</Button></View> : <CustomerLoginHero onSignedIn={() => {}} />}</View>
}
