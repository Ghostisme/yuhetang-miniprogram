import { useState } from 'react'
import Taro from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { themeStyle } from '../../services/site'
import { call, toastError } from '../../services/api'
import type { StoreItem } from '../../types'
import './index.scss'

export default function Stores() {
  const { site, error, refresh } = useSite()
  const [district, setDistrict] = useState(''), [selected, setSelected] = useState('')
  if (!site) return <PageState error={error} retry={() => void refresh(true)} />
  const stores = site.stores.filter(store => store.enabled), store = stores.find(item => item.id === selected)
  const book = (item: StoreItem, serviceId = '') => { if (!item.onlineBooking) return call(item.phone); void Taro.navigateTo({ url: `/pages/booking/index?storeId=${encodeURIComponent(item.id)}&serviceId=${encodeURIComponent(serviceId)}` }) }
  return <View className='page stores-page' style={themeStyle(site)}>
    <View className='page-heading'><Text className='eyebrow'>OUR SPACES</Text><View className='heading'>寻一处安放心绪的地方</View><View className='muted'>选择门店，了解本店开放的项目与到店安排。</View></View>
    {store ? <><Button className='back-link' onClick={() => setSelected('')}>‹ 全部门店</Button><Image className='cover store-detail-cover' src={store.image} mode='aspectFill' /><View className='article'><View className='heading'>{store.name}</View><View className='description'>{store.description}</View><View className='store-meta'><View className='info'>营业时间　{store.hours}</View><View className='info'>{store.address}</View></View><View className='store-actions'><Button onClick={() => call(store.phone)}>致电门店</Button><Button onClick={() => { if (!store.latitude || !store.longitude) return toastError(new Error('门店地图位置待完善，请致电咨询。')); void Taro.openLocation({ latitude: store.latitude, longitude: store.longitude, name: store.name, address: store.address }).catch(toastError) }}>地图导航</Button><Button className='green' onClick={() => book(store)}>{store.onlineBooking ? '申请预约' : '电话咨询'}</Button></View><View className='heading store-service-heading'>本店养护项目</View>{(store.services || []).filter(item => item.enabled).map(item => <View className='choice' key={item.id}><View className='info'><View className='card-title'>{item.name}</View><View className='muted'>{item.subtitle} · {item.duration}</View></View><Button className='link' onClick={() => book(store, item.id)}>申请预约 →</Button></View>)}<View className='gallery'>{store.gallery.map((src, index) => <Image key={`${src}-${index}`} src={src} mode='aspectFill' onClick={() => { void Taro.previewImage({ current: src, urls: store.gallery }) }} />)}</View><CustomerService storeId={store.id} /></View></> : <View className='section store-list'><View className='toolbar'>{['', ...new Set(stores.map(item => item.district))].map(value => <Button key={value} className={district === value ? 'active' : ''} onClick={() => setDistrict(value)}>{value || '全部区域'}</Button>)}</View>{stores.filter(item => !district || item.district === district).map(item => <View className='store-card' key={item.id}><Image src={item.image} mode='aspectFill' onClick={() => setSelected(item.id)} /><View className='card-body'><Text className='pill'>{item.district} · {item.tag}</Text><View className='heading'>{item.name}</View><View className='muted'>{item.address}</View><View className='tiny'>{item.hours}</View><View className='store-actions'><Button onClick={() => setSelected(item.id)}>门店详情</Button><Button className='green' onClick={() => book(item)}>{item.onlineBooking ? '申请预约' : '电话咨询'}</Button></View></View></View>)}{!stores.length && <View className='empty'>门店资料正在完善中。</View>}</View>}
  </View>
}
