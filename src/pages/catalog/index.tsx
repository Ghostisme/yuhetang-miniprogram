import LanguageSwitcher from '../../components/LanguageSwitcher'
import { t, useI18n } from '../../i18n'
import { useState } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { catalogState, themeStyle } from '../../services/site'
import type { ProductItem, ServiceItem } from '../../types'
import './index.scss'

function isService(item: ServiceItem | ProductItem): item is ServiceItem { return 'duration' in item && typeof item.duration === 'string' && 'steps' in item && Array.isArray(item.steps) }

export default function Catalog() {
  const { locale } = useI18n()
  const { site, error, refresh } = useSite()
  const [tab, setTab] = useState('services'), [selected, setDetail] = useState<ServiceItem | ProductItem | null>(null)
  useDidShow(() => {
    const requestedTab = catalogState.tab
    catalogState.tab = ''
    // Native image preview also triggers onShow when it closes. Only an explicit
    // homepage shortcut should replace the current column or its open detail.
    if (requestedTab) { setTab(requestedTab); setDetail(null) }
  })
  if (!site) return <PageState error={t(error)} retry={() => void refresh(true)} />
  const detail: ServiceItem | ProductItem | null = selected ? ([...site.services, ...site.products] as (ServiceItem | ProductItem)[]).find(item => item.id === selected.id) || selected : null
  const book = (id: string) => { void Taro.navigateTo({ url: `/pages/booking/index?serviceId=${encodeURIComponent(id)}` }) }
  const items: (ServiceItem | ProductItem)[] = (tab === 'services' ? site.services : site.products).filter(item => item.enabled)
  return <View className={`page catalog-page locale-${locale}`} style={themeStyle(site)}><LanguageSwitcher />
    <View className='page-heading'><Text className='eyebrow'>WELLNESS &amp; CARE</Text><View className='heading'>{t("一份适合自己的养护")}</View><View className='muted'>{t("循着身体的节奏，找到自己的放松方式。")}</View></View>
    <View className='catalog-tabs'><View className='toolbar'>{[['services', t('特色养护')], ['products', t('东方好物')], ['space', t('空间美学')], ['brand', t('关于裕和堂')]].map(([id, name]) => <Button className={tab === id ? 'active' : ''} key={id} onClick={() => { setTab(id); setDetail(null) }}>{name}</Button>)}</View></View>
    {detail ? <View className='catalog-detail'><Button className='back-link' onClick={() => setDetail(null)}>{t("‹ 返回列表")}</Button><Image className='cover' src={detail.image} mode='aspectFill' /><View className='article'><Text className='eyebrow'>{detail.category}</Text><View className='heading'>{detail.name}</View><View className='muted'>{detail.subtitle}</View>{isService(detail) && <Text className='pill'>{detail.duration}</Text>}<View className='description'>{detail.description}</View>{isService(detail) && <>{!!detail.steps.length && <View className='detail-label'>{t("体验流程")}</View>}{detail.steps.map((step, index) => <View className='care-step' key={index}><Text className='step-index'>{String(index + 1).padStart(2, '0')}</Text><Text>{step}</Text></View>)}<Button className='primary' onClick={() => book(detail.id)}>{t("选择门店并申请预约 →")}</Button></>}</View></View> : <>
      {(tab === 'services' || tab === 'products') && <View className={`section ${tab === 'services' ? 'service-list' : 'product-list grid'}`}>{!items.length && <View className='empty'>{t("内容正在准备中，欢迎联系门店了解。")}</View>}{items.map(item => <View className='card catalog-card' key={item.id} onClick={() => setDetail(item)}><Image src={item.image} mode='aspectFill' /><View className='card-body'><Text className='item-category'>{item.category}</Text><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle}</View><View className='item-bottom'>{isService(item) && <Text className='tiny'>{item.duration}</Text>}<Button className='link' onClick={e => { e.stopPropagation(); setDetail(item) }}>{t("了解更多 →")}</Button></View></View></View>)}</View>}
      {tab === 'space' && site.galleryGroups.map(group => <View className='section' key={group.id}><View className='section-heading'><View className='heading'>{group.name}</View></View><View className='gallery'>{group.images.map((src, index) => <Image key={`${src}-${index}`} src={src} mode='aspectFill' onClick={() => { void Taro.previewImage({ current: src, urls: group.images }) }} />)}</View></View>)}
      {tab === 'brand' && <View className='brand-story'><Image className='cover' src={site.hero.image} mode='aspectFill' /><View className='article'><Text className='eyebrow'>{site.brandEnglish}</Text><View className='heading'>{site.brandName}</View><View className='muted'>{site.tagline}</View><View className='description'>{site.brandStory}</View><View className='banner'>{site.contact.message}</View></View></View>}
    </>}
  </View>
}
