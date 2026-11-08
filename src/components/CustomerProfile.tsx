import { useEffect, useRef, useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Checkbox, CheckboxGroup, Input, Label, Text, View } from '@tarojs/components'
import { hasCustomerSession, isWeapp, request } from '../services/api'
import type { CustomerProfile } from '../types'
import './CustomerProfile.scss'

export default function CustomerProfileCard({ onChanged }: { onChanged?: (profile: CustomerProfile) => void }) {
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
    catch (cause) { if (alive.current && current === version.current) setError(cause instanceof Error ? cause.message : '资料暂未加载，请重试。') }
  }
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false } }, [])
  useDidShow(() => { if (hasCustomerSession()) void load() })
  const ready = !!name.trim() && agreed
  function validate() {
    if (!name.trim()) { setError('请填写您的姓名或称呼。'); return false }
    if (!agreed) { setError('请先同意将资料用于客户档案与预约联系。'); return false }
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
      if (alive.current) { setExpanded(false); void Taro.showToast({ title: code ? '手机号与资料已保存' : '姓名已保存', icon: 'success' }) }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : '资料未保存，请重试。') }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  return <View className='customer-profile-card'>
    <View className='profile-card-header'><View><View className='profile-card-title'>{profile?.complete ? profile.name : '完善客户资料'}</View><View className='profile-card-caption'>{profile?.phoneVerified ? `${profile.phone} · 微信手机号已授权` : '留下称呼与联系电话，让门店更好地接待您。'}</View></View>
      {profile && <Text className={`profile-member ${profile.memberVerified ? 'is-member' : ''}`}>{profile.memberVerified ? profile.memberGrade || '会员' : '非会员'}</Text>}
    </View>
    {profile && (expanded || !profile.complete) && <View className='profile-card-form'>
      <View className='profile-field'><Text>姓名 / 称呼</Text><Input value={name} maxlength={40} placeholder='请输入您的姓名或称呼' disabled={busy} onInput={event => { dirty.current = true; setName(event.detail.value); setError('') }} /></View>
      <CheckboxGroup onChange={event => { setAgreed(event.detail.value.includes('profile')); setError('') }}><Label className='profile-consent'><Checkbox value='profile' checked={agreed} disabled={busy} color='#405c49' /><Text>同意将姓名与授权手机号用于客户档案、预约联系与会员匹配</Text></Label></CheckboxGroup>
      <View className='profile-action-row'>
        {isWeapp ? <Button className='primary' loading={busy} disabled={busy} openType={ready ? 'getPhoneNumber' : undefined}
          onClick={() => { if (!ready) validate() }}
          onGetPhoneNumber={event => {
            if (event.detail.code) void save(event.detail.code)
            else setError(event.detail.errMsg?.includes('deny') || event.detail.errMsg?.includes('cancel') ? '您暂未授权手机号，可先保存称呼，稍后再完善。' : '微信未返回手机号授权凭证，请在手机微信中重试。')
          }}>{profile.phoneVerified ? '重新授权手机号' : '微信授权手机号并保存'}</Button> : <View className='profile-wechat-tip'>请在微信小程序中授权手机号。您可以先保存称呼。</View>}
        <Button className='secondary' disabled={busy} onClick={() => { void save() }}>保存称呼</Button>
      </View>
      <View className='profile-card-note'>手机号由您单独授权；会员状态由门店核实维护。</View>
    </View>}
    {profile?.complete && !expanded && <Button className='profile-edit' onClick={() => { setExpanded(true); setAgreed(false) }}>编辑个人资料 <Text>›</Text></Button>}
    {error && <View className='profile-error' role='alert'>{error}{!profile && <Button className='secondary' onClick={() => { void load() }}>重新加载</Button>}</View>}
  </View>
}
