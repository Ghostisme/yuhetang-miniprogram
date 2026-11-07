import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { catalogState, themeStyle } from '../../services/site'
import type { ProductItem, ServiceItem } from '../../types'
import './index.scss'

export default function Catalog() {
  const { site, error, refresh } = useSite()
  const [tab, setTab] = useState('services'), [detail, setDetail] = useState<ServiceItem | ProductItem | null>(null)
  useDidShow(() => { setTab(catalogState.tab); setDetail(null); catalogState.tab = 'services' })
  if (!site) return <PageState error={error} retry={() => void refresh(true)} />
  const book = (id: string) => { void Taro.navigateTo({ url: `/pages/booking/index?serviceId=${encodeURIComponent(id)}` }) }
  const items: (ServiceItem | ProductItem)[] = (tab === 'services' ? site.services : site.products).filter(item => item.enabled)
  return <View className='page catalog-page' style={themeStyle(site)}>
    <View className='page-heading'><Text className='eyebrow'>WELLNESS &amp; CARE</Text><View className='heading'>一份适合自己的养护</View><View className='muted'>循着身体的节奏，找到自己的放松方式。</View></View>
    <View className='catalog-tabs'><View className='toolbar'>{[['services', '特色养护'], ['products', '东方好物'], ['space', '空间美学'], ['brand', '关于裕和堂']].map(([id, name]) => <Button className={tab === id ? 'active' : ''} key={id} onClick={() => { setTab(id); setDetail(null) }}>{name}</Button>)}</View></View>
    {detail ? <View className='catalog-detail'><Button className='back-link' onClick={() => setDetail(null)}>‹ 返回列表</Button><Image className='cover' src={detail.image} mode='aspectFill' /><View className='article'><Text className='eyebrow'>{detail.category}</Text><View className='heading'>{detail.name}</View><View className='muted'>{detail.subtitle}</View>{'duration' in detail && <Text className='pill'>{detail.duration}</Text>}<View className='description'>{detail.description}</View>{'steps' in detail && <>{!!detail.steps.length && <View className='detail-label'>体验流程</View>}{detail.steps.map((step, index) => <View className='care-step' key={index}><Text className='step-index'>{String(index + 1).padStart(2, '0')}</Text><Text>{step}</Text></View>)}<Button className='primary' onClick={() => book(detail.id)}>选择门店并申请预约 →</Button></>}<CustomerService /></View></View> : <>
      {(tab === 'services' || tab === 'products') && <View className={`section ${tab === 'services' ? 'service-list' : 'product-list grid'}`}>{!items.length && <View className='empty'>内容正在准备中，欢迎联系门店了解。</View>}{items.map(item => <View className='card catalog-card' key={item.id} onClick={() => setDetail(item)}><Image src={item.image} mode='aspectFill' /><View className='card-body'><Text className='item-category'>{item.category}</Text><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><View className='item-bottom'>{'duration' in item && <Text className='tiny'>{item.duration}</Text>}<Button className='link' onClick={e => { e.stopPropagation(); setDetail(item) }}>了解更多 →</Button></View></View></View>)}</View>}
      {tab === 'space' && site.galleryGroups.map(group => <View className='section' key={group.id}><View className='section-heading'><View className='heading'>{group.name}</View></View><View className='gallery'>{group.images.map((src, index) => <Image key={`${src}-${index}`} src={src} mode='aspectFill' onClick={() => { void Taro.previewImage({ current: src, urls: group.images }) }} />)}</View></View>)}
      {tab === 'brand' && <View className='brand-story'><Image className='cover' src={site.hero.image} mode='aspectFill' /><View className='article'><Text className='eyebrow'>{site.brandEnglish}</Text><View className='heading'>{site.brandName}</View><View className='muted'>{site.tagline}</View><View className='description'>{site.brandStory}</View><View className='banner'>{site.contact.message}</View><CustomerService /></View></View>}
    </>}
  </View>
}
