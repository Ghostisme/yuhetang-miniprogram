import { Button, Text, View } from '@tarojs/components'
export default function PageState({ error, loading = true, retry }: { error?: string; loading?: boolean; retry?: () => void }) {
  if (error) return <View className='page'><View className='error-bar'><Text>{error}</Text>{retry && <Button onClick={retry}>点击重试</Button>}</View></View>
  return loading ? <View className='page'><View className='empty'>正在为您准备一段从容时光…</View></View> : null
}
