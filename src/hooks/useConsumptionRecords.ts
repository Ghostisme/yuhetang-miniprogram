import type { MemberSync } from '../components/MemberSyncStatus'
import { useEffect, useRef, useState } from 'react'
import { useDidHide, useDidShow, useUnload } from '@tarojs/taro'
import { hasCustomerSession, request, watchCustomerSession } from '../services/api'
import { createVisibleRefresh } from '../utils/visible-refresh'

export type ConsumptionRecord = {
  id: string; storeId: string; storeName: string; source: 'WALLET' | 'LEGACY' | 'KU52'
  projectName: string; paidFen: number; businessAt: string; referenceNo: string; publicNote: string
  accountLabel: string; balanceAfterFen: number | null; status: 'RECORDED' | 'REVERSED' | 'VOIDED'; version: number
}
export type ConsumptionLookup = {
  items: ConsumptionRecord[]; total: number; page: number; pageSize: number
  stores: { id: string; name: string }[]; asOf: string; scope: 'RECORDED_ONLY'; historyComplete: boolean; sourceSync?: MemberSync
}

export function useConsumptionRecords(enabled: boolean, query: string) {
  const [data, setData] = useState<ConsumptionLookup | null>(null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const active = useRef(enabled), currentQuery = useRef(query), visible = useRef(true), mounted = useRef(true)
  active.current = enabled; currentQuery.current = query
  const reader = useRef<ReturnType<typeof createVisibleRefresh<ConsumptionLookup>>>()
  if (!reader.current) reader.current = createVisibleRefresh({
    read: () => { setLoading(true); return request<ConsumptionLookup>('/api/me/consumption-records?' + currentQuery.current) },
    receive: result => { setData(result); setLoading(false); setError('') },
    fail: cause => { setError(cause instanceof Error ? cause.message : '消费记录暂未加载'); setLoading(false) },
  })
  function start() { if (mounted.current && visible.current && active.current && hasCustomerSession()) void reader.current!.start() }
  function stop() { reader.current!.stop() }
  function reset() { stop(); setData(null); setError(''); setLoading(false) }
  useDidShow(() => { visible.current = true; start() })
  useDidHide(() => { visible.current = false; stop() })
  useUnload(stop)
  useEffect(() => { reset(); if (enabled) start(); return stop }, [enabled, query])
  useEffect(() => {
    mounted.current = true
    const unwatch = watchCustomerSession(() => { reset(); start() })
    const visibility = () => { visible.current = document.visibilityState !== 'hidden'; if (visible.current) start(); else stop() }
    if (process.env.TARO_ENV === 'h5') { visibility(); document.addEventListener('visibilitychange', visibility) }
    return () => { mounted.current = false; stop(); unwatch(); if (process.env.TARO_ENV === 'h5') document.removeEventListener('visibilitychange', visibility) }
  }, [])
  return { data, loading, error, refresh: () => active.current && hasCustomerSession() ? reader.current!.refresh() : Promise.resolve() }
}
