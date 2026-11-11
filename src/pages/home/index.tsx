import { withLaunchNotice } from '../../components/LaunchNotice'
import LanguageSwitcher from '../../components/LanguageSwitcher'
import { t, useI18n } from '../../i18n'
import Taro, { useShareAppMessage } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { catalogState, themeStyle } from '../../services/site'
import careIcon from '../../assets/tabbar/care-active.png'
import storesIcon from '../../assets/tabbar/stores-active.png'
import './index.scss'

function Home() {
  const { locale } = useI18n()
  const { site, error, refresh } = useSite()
  useShareAppMessage(() => ({ title: site ? `${site.brandName} · ${site.tagline}` : t('裕和堂'), path: '/pages/home/index' }))
  if (!site) return <PageState error={t(error)} retry={() => void refresh(true)} />
  const catalog = (tab = 'services') => {
    catalogState.tab = tab
    void Taro.switchTab({ url: '/pages/catalog/index' })
  }
  const book = (id = '') => { void Taro.navigateTo({ url: `/pages/booking/index${id ? `?serviceId=${encodeURIComponent(id)}` : ''}` }) }
  const stores = () => { void Taro.switchTab({ url: '/pages/stores/index' }) }
  return <View className={`page home-page locale-${locale}`} style={themeStyle(site)}><LanguageSwitcher />
    <View className='brand'>
      <View className='brand-lockup'><View className='seal'><View>{t("裕")}</View><View>{t("和")}</View></View><View><View className='brand-name'>{site.brandName}</View><Text className='english'>{site.brandEnglish}</Text></View></View>
      <Button className='order-shortcut' onClick={() => { void Taro.switchTab({ url: '/pages/orders/index' }) }}>{t("我的预约")}<Text className='arrow'>›</Text></Button>
    </View>
    <View className='hero'>
      <Image src={site.hero.image} mode='aspectFill' /><View className='shade' />
      <View className='copy'><Text className='eyebrow'>{site.hero.eyebrow}</Text><View className='title'>{site.hero.title}</View><View className='subtitle'>{site.hero.subtitle}</View><Button className='hero-button' onClick={() => book()}>{site.hero.button}<Text>→</Text></Button></View>
    </View>
    <View className='quick-links'>
      <Button onClick={() => catalog()}><Image className='quick-icon' src={careIcon} /><Text className='quick-label'>{t("特色养护")}</Text><Text className='quick-sub'>{t("照顾身心")}</Text></Button>
      <Button onClick={stores}><Image className='quick-icon' src={storesIcon} /><Text className='quick-label'>{t("城市门店")}</Text><Text className='quick-sub'>{t("遇见一处静谧")}</Text></Button>
      <Button onClick={() => catalog('products')}><View className='quick-icon quick-bag' /><Text className='quick-label'>{t("东方好物")}</Text><Text className='quick-sub'>{t("草木的温度")}</Text></Button>
    </View>
    {site.sections.filter(section => section.enabled).map(section => {
    if (section.id === 'services') return <View className='section' key={section.id}><Text className='eyebrow'>THE ART OF CARE</Text><View className='section-heading'><View className='heading'>{t("从一场放松开始")}</View><Button className='link' onClick={() => catalog()}>{t("全部养护 →")}</Button></View><View className='grid'>{site.services.filter(item => item.enabled).slice(0, 4).map(item => <View className='card' key={item.id}><Image src={item.image} mode='aspectFill' onClick={() => catalog()} /><View className='card-body'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><Text className='duration'>{item.duration}</Text><Button className='primary' onClick={() => book(item.id)}>{t("预约体验")}</Button></View></View>)}</View></View>
    if (section.id === 'space') return <View className='section' key={section.id}><Text className='eyebrow'>A PLACE TO SLOW DOWN</Text><View className='section-heading'><View className='heading'>{t("把城市留在门外")}</View><Button className='link' onClick={stores}>{t("全部门店 →")}</Button></View>{site.stores.filter(item => item.enabled).slice(0, 2).map(item => <View className='card store-preview' key={item.id} onClick={stores}><Image src={item.image} mode='aspectFill' /><View className='card-body'><View className='store-preview-title'><View className='card-title'>{item.name}</View><Text className='link'>{t("查看门店 →")}</Text></View><View className='muted'>{item.address}</View></View></View>)}</View>
    if (section.id === 'products') return <View className='section' key={section.id}><Text className='eyebrow'>EVERYDAY WELLNESS</Text><View className='section-heading'><View className='heading'>{t("好物，日常相伴")}</View><Button className='link' onClick={() => catalog('products')}>{t("全部好物 →")}</Button></View><View className='grid'>{site.products.filter(item => item.enabled).slice(0, 2).map(item => <View className='card' key={item.id} onClick={() => catalog('products')}><Image src={item.image} mode='aspectFill' /><View className='card-body'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View></View></View>)}</View></View>
    if (section.id === 'brand') return <View className='intro' key={section.id}><Text className='eyebrow'>OUR PHILOSOPHY</Text><View className='heading'>{t("东方养护，自在有和。")}</View><View className='muted'>{site.tagline}</View><Button className='link' onClick={() => catalog('brand')}>{t("走近裕和堂 →")}</Button></View>
    return null
    })}
    <View className='section home-contact'><View className='banner'><Text className='strong'>{t("预约小贴士")}</Text>{t("线上提交后，由门店为您确认到店时间与接待安排。")}</View></View>
    {error && <View className='section'><View className='error-bar'>{t(error)}<Button onClick={() => void refresh(true)}>{t("重试")}</Button></View></View>}
    <View className='footer'>YU Health · WELLNESS &amp; CARE</View>
  </View>
}

export default withLaunchNotice(Home)
