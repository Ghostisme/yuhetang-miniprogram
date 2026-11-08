import { useRef, useState } from 'react'
import Taro, { useRouter, useUnload } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Label, Text, View } from '@tarojs/components'
import { authorizeCustomerLogin, cancelCustomerLogin, isWeapp } from '../../services/api'
import { isTabPage, loginReturnTarget } from '../../utils/session'
import './index.scss'

export default function Login() {
  const { params } = useRouter()
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submitting = useRef(false), active = useRef(true)
  useUnload(() => { active.current = false; cancelCustomerLogin() })

  async function leave(signedIn: boolean) {
    if (Taro.getCurrentPages().length > 1) { await Taro.navigateBack(); return }
    let target = params.returnTo || ''
    if (target.startsWith('%2F') || target.startsWith('%2f')) { try { target = decodeURIComponent(target) } catch { target = '' } }
    target = signedIn ? loginReturnTarget(target) : '/pages/home/index'
    if (isTabPage(target)) await Taro.switchTab({ url: target.split('?')[0] })
    else await Taro.redirectTo({ url: target })
  }

  async function signIn() {
    if (submitting.current) return
    if (!agreed) { setError('请先阅读并同意用户协议与隐私说明。'); return }
    submitting.current = true; setBusy(true); setError('')
    try {
      await authorizeCustomerLogin(agreed)
      if (active.current) await leave(true)
    } catch (cause) {
      if (active.current) setError(cause instanceof Error ? cause.message : '微信登录未完成，请重试。')
    } finally {
      submitting.current = false
      if (active.current) setBusy(false)
    }
  }
  const legal = (kind: 'terms' | 'privacy') => { void Taro.navigateTo({ url: `/pages/legal/index?kind=${kind}` }) }
  return <View className='page login-page'>
    <View className='login-brand'>
      <View className='login-seal'><Text>裕</Text><Text>和</Text></View>
      <View className='login-wordmark'>裕和堂</View><Text className='login-english'>YU HE TANG</Text>
      <Text className='login-brand-note'>东方养护 · 用心相待</Text>
    </View>
    <View className='login-content'>
      <Text className='eyebrow'>A MOMENT FOR YOURSELF</Text>
      <View className='heading'>安心相遇，从这里开始</View>
      <View className='login-intro'>登录后，预约一段养护时光，<Text>也让每一次咨询与到店安排有迹可循。</Text></View>
      <View className='login-benefits'><Text>预约记录</Text><Text>门店咨询</Text><Text>到店提醒</Text></View>
      {error && <View className='login-error' role='alert'>{error}</View>}
      <Button className='login-submit' loading={busy} disabled={busy} onClick={() => { void signIn() }}><View className='login-wechat-icon'><View /><View /></View><Text>{busy ? '正在登录…' : '微信授权登录'}</Text></Button>
      <View className='login-caption'>用于识别您的客户账号，无需填写密码。</View>
      {!isWeapp && !ENABLE_DEV_LOGIN && <View className='login-platform-note'>请在微信小程序中完成登录，H5 可继续浏览门店与项目。</View>}
      {ENABLE_DEV_LOGIN && <View className='login-platform-note'>当前为本地开发环境，登录后使用独立的模拟客户身份。</View>}
      <Button className='login-guest' disabled={busy} onClick={() => { void leave(false) }}>先逛逛，暂不登录 <Text>›</Text></Button>
      <View className={`login-consent ${error && !agreed ? 'needs-consent' : ''}`}>
        <CheckboxGroup onChange={e => { setAgreed(e.detail.value.includes('agree')); setError('') }}><Label className='login-consent-toggle'><Checkbox value='agree' checked={agreed} disabled={busy} color='#435e4b' /><Text>我已阅读并同意</Text></Label></CheckboxGroup>
        <View className='login-legal-links'><Button disabled={busy} onClick={() => legal('terms')}>《用户协议》</Button><Text>与</Text><Button disabled={busy} onClick={() => legal('privacy')}>《隐私说明》</Button></View>
      </View>
      <View className='login-footer'><View className='login-lock' /><Text>仅为提供预约与接待服务，妥善保管您的信息</Text></View>
    </View>
  </View>
}
