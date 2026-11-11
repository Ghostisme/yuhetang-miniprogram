import { withLaunchNotice } from '../../components/LaunchNotice'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { t, useI18n } from '../../i18n'
import Taro from '@tarojs/taro'
import { Button, Text, View } from '@tarojs/components'
import CustomerProfileCard from '../../components/CustomerProfile'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { useCustomerSession } from '../../hooks/useCustomerSession'
import './index.scss'

function Profile() {
  const { locale } = useI18n()
  const signedIn = useCustomerSession()
  return <View className={`page profile-page locale-${locale}`}>{signedIn && <LanguageSwitcher />}{signedIn ? <View className='section'><Text className='eyebrow'>YOUR PROFILE</Text><View className='heading'>{t("个人资料")}</View><CustomerProfileCard /><Button className='secondary' onClick={() => { if (Taro.getCurrentPages().length > 1) void Taro.navigateBack(); else void Taro.switchTab({ url: '/pages/orders/index' }) }}>{t("返回")}</Button></View> : <CustomerLoginHero onSignedIn={() => {}} />}</View>
}

export default withLaunchNotice(Profile)
