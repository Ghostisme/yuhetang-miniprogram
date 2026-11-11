import LanguageSwitcher from './LanguageSwitcher'
import { t, useI18n } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Image, Label, ScrollView, Text, View } from '@tarojs/components'
import { authorizeCustomerLogin, cancelCustomerLogin, isWeapp, toastError } from '../services/api'
import { isTabPage } from '../utils/session'
import { customerActionAvailable } from '../services/launch-mode'
import space from '../assets/login/space.jpg'
import reception from '../assets/login/reception.jpg'
import './CustomerLogin.scss'

type LoginProps = { onSignedIn: () => void | Promise<void> }

function useAuthorization(onSignedIn: LoginProps['onSignedIn']) {
  const [agreed, setAgreed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submitting = useRef(false), generation = useRef(0)
  function cancel() {
    generation.current++
    if (submitting.current) cancelCustomerLogin()
    submitting.current = false
  }
  useEffect(() => cancel, [])
  useDidHide(() => { cancel(); setBusy(false) })
  async function signIn() {
    if (!customerActionAvailable()) return
    if (submitting.current) return
    if (!agreed) { setError(t('请先阅读并同意用户协议与隐私说明。')); return }
    const attempt = ++generation.current
    submitting.current = true; setBusy(true); setError('')
    try {
      await authorizeCustomerLogin(agreed)
      if (attempt === generation.current) await onSignedIn()
    } catch (cause) {
      if (attempt === generation.current) setError(cause instanceof Error ? cause.message : t('微信登录未完成，请重试。'))
    } finally {
      if (attempt === generation.current) { submitting.current = false; setBusy(false) }
    }
  }
  return { agreed, busy, error, signIn, cancel, agree: (value: boolean) => { setAgreed(value); setError('') } }
}

type Authorization = ReturnType<typeof useAuthorization>
function LoginConsent({ auth, hero = false }: { auth: Authorization; hero?: boolean }) {
  useI18n()
  const legal = (kind: 'terms' | 'privacy') => { void Taro.navigateTo({ url: `/pages/legal/index?kind=${kind}` }).catch(toastError) }
  return <View className={`login-consent ${hero ? 'on-photo' : ''} ${auth.error && !auth.agreed ? 'needs-consent' : ''}`}>
    <CheckboxGroup onChange={e => auth.agree(e.detail.value.includes('agree'))}>
      <Label className='login-consent-toggle'>
        <View className='login-consent-row'>
          <Checkbox className='login-native-checkbox' value='agree' checked={auth.agreed} disabled={auth.busy} color='#375b49' nativeProps={{ 'aria-label': t('同意用户协议与隐私说明') }} />
          <View className={`login-consent-circle ${auth.agreed ? 'checked' : ''}`} aria-hidden='true' />
          <Text>{hero ? t('我已阅读并同意') : t('开启裕和堂的完整体验')}</Text>
        </View>
      </Label>
    </CheckboxGroup>
    <View className='login-legal-links'>
      {!hero && <Text>{t("同意")}</Text>}<Button disabled={auth.busy} onClick={() => legal('terms')}>{t("《用户协议》")}</Button><Text>{t("与")}</Text><Button disabled={auth.busy} onClick={() => legal('privacy')}>{t("《隐私说明》")}</Button>
      {!hero && <Text>{t("，为您登录或创建客户账号。")}</Text>}
    </View>
  </View>
}

export function CustomerLoginHero({ onSignedIn, withTabbar = false, error: pageError }: LoginProps & { withTabbar?: boolean; error?: string }) {
  useI18n()
  const auth = useAuthorization(onSignedIn)
  return <View className={`customer-login-hero ${withTabbar && !isWeapp ? 'with-web-tabbar' : ''}`}>
    <LanguageSwitcher light />
    <Image className='login-hero-image' src={space} mode='aspectFill' />
    <View className='login-hero-shade' />
    <View className='login-hero-brand'><Text className='login-hero-brand-name'>{t("裕和堂")}</Text><Text className='login-hero-brand-english'>YU Health</Text></View>
    <View className='login-hero-content'>
      <View className='login-hero-title'>{t("留一段时光")}<Text>{t("好好照顾自己")}</Text></View>
      <View className='login-hero-subtitle'>{t("一份东方养护，一次安心相遇。")}</View>
      {(auth.error || pageError) && <View className='login-error' role='alert'>{t(auth.error || pageError)}</View>}
      <Button className='login-hero-submit' loading={auth.busy} disabled={auth.busy} onClick={() => { void auth.signIn() }}>{auth.busy ? t('正在登录…') : t('登录')}</Button>
      <LoginConsent auth={auth} hero />
      <Button className='login-hero-browse' disabled={auth.busy} onClick={() => { void Taro.switchTab({ url: '/pages/stores/index' }).catch(toastError) }}>{t("先看看门店")}<Text>›</Text></Button>
    </View>
  </View>
}

function LoginSheetContent({ onSignedIn, onClose }: LoginProps & { onClose: () => void }) {
  useI18n()
  const auth = useAuthorization(onSignedIn)
  const hideTabbar = () => {
    const route = Taro.getCurrentPages().slice(-1)[0]?.route || ''
    if (isTabPage('/' + route.replace(/^\//, ''))) void Taro.hideTabBar({ animation: false }).catch(() => {})
  }
  useDidShow(hideTabbar)
  useEffect(() => {
    const route = Taro.getCurrentPages().slice(-1)[0]?.route || ''
    const tab = isTabPage('/' + route.replace(/^\//, ''))
    hideTabbar()
    if (isWeapp) void Taro.hideKeyboard().catch(() => {})
    return () => { if (tab) void Taro.showTabBar({ animation: false }).catch(() => {}) }
  }, [])
  function dismiss() { auth.cancel(); onClose() }
  return <View className='customer-login-overlay'>
    <View className='login-sheet-mask' catchMove onClick={dismiss} />
    <View className='login-sheet-dialog' role='dialog' aria-modal='true' aria-label={t('裕和堂登录授权')}>
      <View className='login-sheet-header'>
        <Image className='login-sheet-photo' src={reception} mode='aspectFill' />
        <View className='login-sheet-shade' />
        <View className='login-sheet-brand'>{t("裕和堂")}<Text>YU Health</Text></View>
        <View className='login-sheet-heading'>{t("把时间留给自己")}<Text>{t("让养护融入日常")}</Text></View>
        <View className='login-sheet-caption'>{t("预约养护 · 门店咨询 · 到店提醒")}</View>
        <Button className='login-sheet-close' aria-label={t('关闭登录')} onClick={dismiss}><View aria-hidden='true' /></Button>
      </View>
      <ScrollView className='login-sheet-body' scrollY>
        <View className='login-sheet-body-inner'>
          <View className='login-sheet-title'>{t("授权确认")}</View>
          <LoginConsent auth={auth} />
          {auth.error && <View className='login-error' role='alert'>{t(auth.error)}</View>}
          <Button className='login-submit' loading={auth.busy} disabled={auth.busy} onClick={() => { void auth.signIn() }}>{auth.busy ? t('正在登录…') : t('立即登录')}</Button>
          <Button className='login-guest' onClick={dismiss}>{t("仅浏览")}</Button>
        </View>
      </ScrollView>
    </View>
  </View>
}

export function CustomerLoginSheet({ open, ...props }: LoginProps & { open: boolean; onClose: () => void }) {
  useI18n()
  return open ? <LoginSheetContent {...props} /> : null
}
