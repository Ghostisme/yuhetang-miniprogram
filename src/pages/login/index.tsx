import Taro, { useRouter } from '@tarojs/taro'
import { View } from '@tarojs/components'
import { CustomerLoginHero } from '../../components/CustomerLogin'
import { isTabPage, loginReturnTarget } from '../../utils/session'
import './index.scss'

export default function Login() {
  const { params } = useRouter()
  async function signedIn() {
    if (Taro.getCurrentPages().length > 1) { await Taro.navigateBack(); return }
    let target = params.returnTo || ''
    if (/^%2f/i.test(target)) { try { target = decodeURIComponent(target) } catch { target = '' } }
    target = loginReturnTarget(target)
    if (isTabPage(target)) await Taro.switchTab({ url: target.split('?')[0] })
    else await Taro.redirectTo({ url: target })
  }
  return <View className='page login-page'><CustomerLoginHero onSignedIn={signedIn} /></View>
}
