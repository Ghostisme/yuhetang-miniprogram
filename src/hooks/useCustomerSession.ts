import { useEffect, useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { hasCustomerSession, watchCustomerSession } from '../services/api'

export function useCustomerSession(): boolean {
  const [signedIn, setSignedIn] = useState(hasCustomerSession)
  useDidShow(() => { setSignedIn(hasCustomerSession()) })
  useEffect(() => watchCustomerSession(() => setSignedIn(hasCustomerSession())), [])
  return signedIn
}
