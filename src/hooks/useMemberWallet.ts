import type { MemberSync } from '../components/MemberSyncStatus'
import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow, useUnload } from '@tarojs/taro'
import { hasCustomerSession, request, watchCustomerSession } from '../services/api'
import { createVisibleRefresh } from '../utils/visible-refresh'

export type MemberWalletAccount = { id: string; storeName: string; label: string; balanceFen: number; version: number; openingAsOf: string; updatedAt: string; source?: string; cardNumber?: string; memberNumber?: string; validity?: string; discount?: number }
export type MemberWalletLookup = {
  accounts: MemberWalletAccount[]; asOf?: string
  lookupStatus?: 'MEMBERSHIP_PENDING' | 'MIGRATION_PENDING' | 'AVAILABLE'
  memberVerified?: boolean; balanceKnown?: boolean; totalFen?: number | null
  balanceScope?: 'MIGRATED_ACCOUNTS_ONLY' | 'LOCAL_AND_SOURCE_CARDS'; sourceSync?: MemberSync
}

/** Direct authenticated balance reads. Official-account binding is entirely optional. */
export function useMemberWallet(enabled: boolean) {
  const [lookup, setLookup] = useState<MemberWalletLookup | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const [fetchedAt, setFetchedAt] = useState(0)
  const visible = useRef(true), active = useRef(enabled), mounted = useRef(true)
  active.current = enabled
  const reader = useRef<ReturnType<typeof createVisibleRefresh<MemberWalletLookup>>>()
  if (!reader.current) reader.current = createVisibleRefresh({
    read: async () => { setLoading(true); return request<MemberWalletLookup>('/api/me/wallets') },
    receive: result => { setLookup(result); setFetchedAt(Date.now()); setError(''); setLoading(false) },
    fail: cause => { setError(cause instanceof Error ? cause.message : '余额暂未加载'); setLoading(false) },
  })
  const refresh = () => active.current && hasCustomerSession() ? reader.current!.refresh() : Promise.resolve()
  function start() { if (mounted.current && visible.current && active.current && hasCustomerSession()) void reader.current!.start() }
  function stop() { reader.current!.stop() }
  function reset() { stop(); setLookup(null); setFetchedAt(0); setError(''); setLoading(false) }
  useDidShow(() => { visible.current = true; start() })
  useDidHide(() => { visible.current = false; stop() })
  useUnload(() => { visible.current = false; stop() })
  useEffect(() => { if (enabled) start(); else reset(); return stop }, [enabled])
  useEffect(() => {
    mounted.current = true
    const unwatch = watchCustomerSession(() => { reset(); start() })
    const visibility = () => { visible.current = document.visibilityState !== 'hidden'; if (visible.current) start(); else stop() }
    if (process.env.TARO_ENV === 'h5') {
      if (document.visibilityState === 'hidden') { visible.current = false; stop() }
      document.addEventListener('visibilitychange', visibility)
    }
    return () => { mounted.current = false; stop(); unwatch(); if (process.env.TARO_ENV === 'h5') document.removeEventListener('visibilitychange', visibility) }
  }, [])
  return { lookup, loading, error, fetchedAt, refresh }
}
