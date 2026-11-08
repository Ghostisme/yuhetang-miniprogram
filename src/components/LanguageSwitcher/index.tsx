import { Button, Text, View } from '@tarojs/components'
import { chooseLanguage, useI18n } from '../../i18n'
import './index.scss'

export default function LanguageSwitcher({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  const { locale, languageName } = useI18n()
  return <View className={`language-switcher${compact ? ' compact' : ''}${light ? ' light' : ''}`}>
    <Button className='language-button' aria-label='中文 / English / 日本語' onClick={() => { void chooseLanguage() }}>
      <Text className='language-globe'>◎</Text><Text>{locale === 'en' ? 'English' : languageName}</Text><Text className='language-chevron'>⌄</Text>
    </Button>
  </View>
}
