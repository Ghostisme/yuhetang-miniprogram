import { useLaunchStatus } from '../hooks/useLaunchStatus'
import { customerActionAvailable } from '../services/launch-mode'
import { t, useI18n } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Input, Label, Text, View } from '@tarojs/components'
import { hasCustomerSession, isWeapp, request } from '../services/api'
import type { CustomerProfile } from '../types'
import MemberBalanceSummary from './MemberBalanceSummary'
import './CustomerProfile.scss'

export default function CustomerProfileCard({ onChanged, showWallet = true }: { onChanged?: (profile: CustomerProfile) => void; showWallet?: boolean }) {
  useI18n()
  const launch = useLaunchStatus()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [name, setName] = useState(''), [agreed, setAgreed] = useState(false)
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const alive = useRef(true), sending = useRef(false), dirty = useRef(false), latestChanged = useRef(onChanged), version = useRef(0)
  latestChanged.current = onChanged
  function receive(next: CustomerProfile) {
    if (!alive.current || !hasCustomerSession()) return
    setProfile(next); if (!dirty.current) setName(next.name)
    latestChanged.current?.(next)
  }
  async function load() {
    if (sending.current) return
    const current = ++version.current
    try { const next = await request<CustomerProfile>('/api/me/profile'); if (current === version.current) { receive(next); if (alive.current) setError('') } }
    catch (cause) { if (alive.current && current === version.current) setError(cause instanceof Error ? cause.message : t('资料暂未加载，请重试。')) }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [])
  useDidShow(() => { if (hasCustomerSession()) void load() })
  const ready = !!name.trim() && agreed
  function validate() {
    if (!customerActionAvailable()) return false
    if (!name.trim()) { setError(t('请填写您的姓名或称呼。')); return false }
    if (!agreed) { setError(t('请先同意将资料用于客户档案与预约联系。')); return false }
    return true
  }
  async function save(code?: string) {
    if (sending.current || !validate()) return
    sending.current = true; version.current++; setBusy(true); setError('')
    try {
      const next = await request<CustomerProfile>(code ? '/api/me/profile/phone' : '/api/me/profile', {
        method: code ? 'POST' : 'PUT', data: { name: name.trim(), consent: true, ...(code ? { code } : {}) },
      })
      dirty.current = false; receive(next)
      if (alive.current) { setExpanded(false); void Taro.showToast({ title: code ? t('手机号与资料已保存') : t('姓名已保存'), icon: 'success' }) }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : t('资料未保存，请重试。')) }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  return <View className='customer-profile-card'>
    <View className='profile-card-header'><View><View className='profile-card-title'>{profile?.complete ? profile.name : t('完善客户资料')}</View><View className='profile-card-caption'>{profile?.phoneVerified ? t('{phone} · 微信手机号已授权', { phone: profile.phone }) : t('留下称呼与联系电话，让门店更好地接待您。')}</View></View>
      {profile && <Text className={`profile-member ${profile.memberVerified ? 'is-member' : ''}`}>{profile.memberVerified ? t(profile.memberGrade) || t('会员') : t('非会员')}</Text>}
    </View>
    {profile?.memberVerified&&<View className='profile-card-note'>{profile.memberStoreName?t('会员归属门店：{store}',{store:t(profile.memberStoreName)}):t('会员归属门店待核实，不影响预约。')}<View>{t('会员可选择其他门店预约；项目与接待按到店门店安排。')}</View></View>}
    {profile && (expanded || !profile.complete) && <View className='profile-card-form'>
      <View className='profile-field'><Text>{t("姓名 / 称呼")}</Text><Input value={name} maxlength={40} placeholder={t('请输入您的姓名或称呼')} disabled={busy} onInput={event => { dirty.current = true; setName(event.detail.value); setError('') }} /></View>
      <CheckboxGroup onChange={event => { setAgreed(event.detail.value.includes('profile')); setError('') }}><Label className='profile-consent'><Checkbox value='profile' checked={agreed} disabled={busy} color='#405c49' /><Text>{t("同意将姓名与授权手机号用于客户档案、预约联系与会员匹配")}</Text></Label></CheckboxGroup>
      <View className='profile-action-row'>
        {isWeapp ? <Button className='primary' loading={busy} disabled={busy} openType={ready && launch.ready && !launch.status?.enabled ? 'getPhoneNumber' : undefined}
          onClick={() => { if (!ready) validate() }}
          onGetPhoneNumber={event => {
            if (event.detail.code) void save(event.detail.code)
            else setError(event.detail.errMsg?.includes('deny') || event.detail.errMsg?.includes('cancel') ? t('您暂未授权手机号，可先保存称呼，稍后再完善。') : t('微信未返回手机号授权凭证，请在手机微信中重试。'))
          }}>{profile.phoneVerified ? t('重新授权手机号') : t('微信授权手机号并保存')}</Button> : <View className='profile-wechat-tip'>{t("请在微信小程序中授权手机号。您可以先保存称呼。")}</View>}
        <Button className='secondary' disabled={busy} onClick={() => { void save() }}>{t("保存称呼")}</Button>
      </View>
      <View className='profile-card-note'>{t("手机号由您单独授权；会员状态由门店核实维护。")}</View>
    </View>}
    {profile?.complete && !expanded && <Button className='profile-edit' onClick={() => { setExpanded(true); setAgreed(false) }}>{t("编辑个人资料")}<Text>›</Text></Button>}
    {profile&&showWallet&&<MemberBalanceSummary phoneVerified={profile.phoneVerified} />}
    {error && <View className='profile-error' role='alert'>{t(error)}{!profile && <Button className='secondary' onClick={() => { void load() }}>{t("重新加载")}</Button>}</View>}
  </View>
}
