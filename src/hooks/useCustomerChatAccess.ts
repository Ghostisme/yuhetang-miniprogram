import { useEffect, useRef, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { hasCustomerSession, request, watchCustomerSession } from '../services/api'
import { useCustomerSession } from './useCustomerSession'
import { canContactCustomerService } from '../utils/chat-access'
import type { CustomerProfile } from '../types'

/** Recheck on returning from login/profile/native WeChat; never persist an eligibility flag. */
export function useCustomerChatAccess() {
  const signedIn = useCustomerSession()
  const [profile, setProfile] = useState<CustomerProfile | null>(null)
  const [checking, setChecking] = useState(hasCustomerSession)
  const [error, setError] = useState('')
  const mounted = useRef(true), generation = useRef(0)
  async function refresh() {
    const version = ++generation.current
    if (!hasCustomerSession()) { setProfile(null); setChecking(false); setError(''); return null }
    setChecking(true); setError('')
    try {
      const next = await request<CustomerProfile>('/api/me/profile')
      if (!mounted.current || version !== generation.current) return null
      setProfile(next); return next
    } catch (cause) {
      if (mounted.current && version === generation.current) { setProfile(null); setError(cause instanceof Error ? cause.message : '资料暂未加载，请重试。') }
      return null
    } finally { if (mounted.current && version === generation.current) setChecking(false) }
  }
  function changed(next: CustomerProfile) {
    generation.current++
    if (mounted.current && hasCustomerSession()) { setProfile(next); setChecking(false); setError('') }
  }
  useDidShow(() => { void refresh() })
  useEffect(() => {
    mounted.current = true; void refresh()
    const unwatch = watchCustomerSession(() => { setProfile(null); void refresh() })
    return () => { mounted.current = false; generation.current++; unwatch() }
  }, [])
  return { signedIn, profile, checking, error, refresh, changed, ready: signedIn && !checking && canContactCustomerService(profile) }
}
