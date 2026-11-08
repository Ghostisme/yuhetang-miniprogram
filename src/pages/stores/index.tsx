import LanguageSwitcher from '../../components/LanguageSwitcher'
import { t, useI18n } from '../../i18n'
import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { themeStyle } from '../../services/site'
import { call, toastError } from '../../services/api'
import type { StoreItem } from '../../types'
import './index.scss'

export default function Stores() {
  const { locale } = useI18n()
  const { site, error, refresh } = useSite()
  const [district, setDistrict] = useState('')
  if (!site) return <PageState error={t(error)} retry={() => void refresh(true)} />
  const stores = site.stores.filter(store => store.enabled)
  const selectStore = (id: string) => { void Taro.navigateTo({ url: `/pages/store-detail/index?storeId=${encodeURIComponent(id)}` }).catch(toastError) }
  const book = (item: StoreItem, serviceId = '') => { if (!item.onlineBooking) return call(item.phone); void Taro.navigateTo({ url: `/pages/booking/index?storeId=${encodeURIComponent(item.id)}&serviceId=${encodeURIComponent(serviceId)}` }) }
  return <View className={`page stores-page locale-${locale}`} style={themeStyle(site)}><LanguageSwitcher />
    <View className='page-heading'><Text className='eyebrow'>OUR SPACES</Text><View className='heading'>{t("寻一处安放心绪的地方")}</View><View className='muted'>{t("选择门店，了解本店开放的项目与到店安排。")}</View></View>
    <View className='section store-list'><View className='toolbar'>{['', ...new Set(stores.map(item => item.district))].map(value => <Button key={value} className={district === value ? 'active' : ''} onClick={() => setDistrict(value)}>{t(value || '全部区域')}</Button>)}</View>{stores.filter(item => !district || item.district === district).map(item => <View className='store-card' key={item.id}><Image src={item.image} mode='aspectFill' onClick={() => selectStore(item.id)} /><View className='card-body'><Text className='pill'>{t(item.district)} · {item.tag}</Text><View className='heading'>{item.name}</View><View className='muted'>{item.address}</View><View className='tiny'>{item.hours}</View><View className='store-actions'><Button onClick={() => selectStore(item.id)}>{t("门店详情")}</Button><Button className='green' onClick={() => book(item)}>{item.onlineBooking ? t('申请预约') : t('电话咨询')}</Button></View></View></View>)}{!stores.length && <View className='empty'>{t("门店资料正在完善中。")}</View>}</View>
  </View>
}
