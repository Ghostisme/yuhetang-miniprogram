import { useState } from 'react'
import { Button, Text, View } from '@tarojs/components'
import { contact, isWeapp } from '../../services/api'
import './index.scss'

export default function CustomerService({ storeId = '', label = '微信客服', variant = 'secondary', showOnline = true }: { storeId?: string; label?: string; variant?: string; showOnline?: boolean }) {
  const [error, setError] = useState('')
  return <View className={`customer-service ${variant}`}>
    {isWeapp && <Button className='native' openType='contact' sessionFrom={`yht-store:${storeId}`} onError={() => setError('微信客服暂时无法打开，请使用在线咨询。')}>{label}</Button>}
    {showOnline && <Button className={isWeapp ? 'online' : 'native'} onClick={() => { void contact(storeId) }}>{isWeapp ? '在线咨询 · 回复将在本页会话中展示' : '在线咨询 · 联系门店'}</Button>}
    {error && <Text className='error'>{error}</Text>}
  </View>
}
