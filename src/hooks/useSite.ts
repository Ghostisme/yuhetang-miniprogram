import { useRef, useState } from 'react'
import { useDidShow, usePullDownRefresh, useUnload } from '@tarojs/taro'
import Taro from '@tarojs/taro'
import { loadSite } from '../services/site'
import { message } from '../utils/booking'
import type { Site } from '../types'

export function useSite() {
  const [site, setSite] = useState<Site | null>(null), [error, setError] = useState('')
  const active = useRef(true)
  async function refresh(force = false) {
    try { const result = await loadSite(force); if (active.current) { setSite(result); setError('') } }
    catch (error) { if (active.current) setError(message(error)) }
    finally { void Taro.stopPullDownRefresh() }
  }
  useDidShow(() => { active.current = true; void refresh() })
  usePullDownRefresh(() => { void refresh(true) })
  useUnload(() => { active.current = false })
  return { site, error, refresh }
}
