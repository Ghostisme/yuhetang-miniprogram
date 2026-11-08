import { t, useI18n } from '../../i18n'
import { Button, Text, View } from '@tarojs/components'
export default function PageState({ error, loading = true, retry }: { error?: string; loading?: boolean; retry?: () => void }) {
  useI18n()
  if (!error && !loading) return null
  return <View className='page state-page'><View className='state-card'>
    <View className='state-dots'><View /><View /><View /></View>
    <View className='heading'>{error ? t('暂时未能加载') : t('稍候，时光正好')}</View>
    <Text className='muted'>{t(error) || t('正在为您准备门店与养护信息…')}</Text>
    {error && retry && <Button className='primary' onClick={retry}>{t("重新加载")}</Button>}
  </View></View>
}
