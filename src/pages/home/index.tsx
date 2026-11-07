import Taro, { useShareAppMessage } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { catalogState, themeStyle } from '../../services/site'
import './index.scss'

export default function Home() {
  const { site, error, refresh } = useSite()
  useShareAppMessage(() => ({ title: site ? `${site.brandName} · ${site.tagline}` : '裕和堂', path: '/pages/home/index' }))
  const tab = (url: string) => { void Taro.switchTab({ url: `/pages/${url}/index` }) }
  const catalog = (name = 'services') => { catalogState.tab = name; tab('catalog') }
  const book = (serviceId = '') => { void Taro.navigateTo({ url: `/pages/booking/index?serviceId=${encodeURIComponent(serviceId)}` }) }
  if (!site) return <PageState error={error} retry={() => void refresh(true)} />
  return <View className='page home-page' style={themeStyle(site)}>
    <View className='brand'><View className='seal'><View>裕</View><View>和</View></View><View><View className='brand-name'>{site.brandName}</View><Text className='english'>{site.brandEnglish}</Text></View></View>
    <Button className='order-shortcut' onClick={() => tab('orders')}>查看我的预约申请 ›</Button>
    <View className='hero'><Image src={site.hero.image} mode='aspectFill' /><View className='hero-shade' /><View className='hero-copy'><Text className='eyebrow'>{site.hero.eyebrow}</Text><View className='title'>{site.hero.title}</View><View className='subtitle'>{site.hero.subtitle}</View><Button className='hero-button' onClick={() => book()}>{site.hero.button}　→</Button></View></View>
    <View className='quick-links'><Button onClick={() => catalog()}><Text className='symbol'>♧</Text>特色养护<Text className='sub'>照顾身心</Text></Button><Button onClick={() => tab('stores')}><Text className='symbol'>⌖</Text>城市门店<Text className='sub'>遇见一处静谧</Text></Button><Button onClick={() => catalog('products')}><Text className='symbol'>❧</Text>东方好物<Text className='sub'>草木的温度</Text></Button></View>
    {site.sections.filter(section => section.enabled).map(section => {
      if (section.id === 'services') return <View className='section' key={section.id}><Text className='eyebrow'>THE ART OF CARE</Text><View className='section-heading'><Text className='heading'>从一场放松开始</Text><Button className='link' onClick={() => catalog()}>探索更多 →</Button></View><View className='grid'>{site.services.filter(item => item.enabled).slice(0, 4).map(item => <View className='card' key={item.id}><Image src={item.image} mode='aspectFill' /><View className='card-body'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><Button className='primary' onClick={() => book(item.id)}>了解并申请 →</Button></View></View>)}</View></View>
      if (section.id === 'space') return <View className='section' key={section.id}><Text className='eyebrow'>A PLACE TO UNWIND</Text><View className='section-heading'><Text className='heading'>把城市留在门外</Text><Button className='link' onClick={() => tab('stores')}>全部门店 →</Button></View>{site.stores.filter(item => item.enabled).slice(0, 2).map(item => <View className='card store-preview' key={item.id} onClick={() => tab('stores')}><Image src={item.image} mode='aspectFill' /><View className='card-body'><View className='card-title'>{item.name}</View><View className='muted'>{item.address}</View></View></View>)}</View>
      if (section.id === 'products') return <View className='section' key={section.id}><Text className='eyebrow'>BOTANICAL EVERYDAY</Text><View className='section-heading'><Text className='heading'>东方好物，日常相伴</Text><Button className='link' onClick={() => catalog('products')}>看一看 →</Button></View><View className='grid'>{site.products.filter(item => item.enabled).slice(0, 2).map(item => <View className='card' key={item.id} onClick={() => catalog('products')}><Image src={item.image} mode='aspectFill' /><View className='card-body'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View></View></View>)}</View></View>
      if (section.id === 'brand') return <View className='intro' key={section.id}><Text className='eyebrow'>OUR PHILOSOPHY</Text><View className='heading'>东方养护，自在有和。</View><View className='muted'>{site.tagline}</View><Button className='link' onClick={() => catalog('brand')}>走近裕和堂 →</Button></View>
      return null
    })}
    <View className='section'><View className='banner'><Text className='strong'>温馨提示</Text>线上提交为预约申请，需门店人工确认。调理师意向与到店安排以门店回复为准。</View><CustomerService label='微信客服 · 有事请随时联系我们' /></View><View className='footer'>YU HE TANG · WELLNESS &amp; CARE</View>
    {error && <PageState error={error} retry={() => void refresh(true)} />}
  </View>
}
