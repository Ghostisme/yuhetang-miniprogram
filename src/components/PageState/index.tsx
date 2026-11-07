import { Button, Text, View } from '@tarojs/components'
export default function PageState({ error, loading = true, retry }: { error?: string; loading?: boolean; retry?: () => void }) {
  if (!error && !loading) return null
  return <View className='page state-page'><View className='state-card'>
    <View className='state-dots'><View /><View /><View /></View>
    <View className='heading'>{error ? '暂时未能加载' : '稍候，时光正好'}</View>
    <Text className='muted'>{error || '正在为您准备门店与养护信息…'}</Text>
    {error && retry && <Button className='primary' onClick={retry}>重新加载</Button>}
  </View></View>
}
