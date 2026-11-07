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
  const [district, setDistrict] = useState(''), [selected, setSelected] = useState(''), [expanded, setExpanded] = useState('')
  if (!site) return <PageState error={error} retry={() => void refresh(true)} />
  const stores = site.stores.filter(store => store.enabled), store = stores.find(item => item.id === selected)
  const services = (store?.services || []).filter(item => item.enabled)
  const gallery = [...new Set((store?.gallery || []).filter(Boolean))]
  const selectStore = (id: string) => { setSelected(id); setExpanded(''); void Taro.pageScrollTo({ scrollTop: 0, duration: 0 }) }
  const book = (item: StoreItem, serviceId = '') => { if (!item.onlineBooking) return call(item.phone); void Taro.navigateTo({ url: `/pages/booking/index?storeId=${encodeURIComponent(item.id)}&serviceId=${encodeURIComponent(serviceId)}` }) }
  return <View className='page stores-page' style={themeStyle(site)}>
    <View className='page-heading'><Text className='eyebrow'>OUR SPACES</Text><View className='heading'>寻一处安放心绪的地方</View><View className='muted'>选择门店，了解本店开放的项目与到店安排。</View></View>
    {store ? <>
      <Button className='back-link' onClick={() => selectStore('')}>‹ 全部门店</Button>
      <Image className='cover store-detail-cover' src={store.image} mode='aspectFill' />
      <View className='article'>
        <View className='heading'>{store.name}</View><View className='description'>{store.description}</View>
        <View className='store-meta'><View className='info'>营业时间　{store.hours}</View><View className='info'>{store.address}</View></View>
        <View className='store-actions'><Button onClick={() => call(store.phone)}>致电门店</Button><Button onClick={() => { if (!store.latitude || !store.longitude) return toastError(new Error('门店地图位置待完善，请致电咨询。')); void Taro.openLocation({ latitude: store.latitude, longitude: store.longitude, name: store.name, address: store.address }).catch(toastError) }}>地图导航</Button><Button className='green' onClick={() => book(store)}>{store.onlineBooking ? '申请预约' : '电话咨询'}</Button></View>
        <View className='store-services'>
          <View className='store-section-heading'><View className='heading'>本店养护项目</View>{services.length > 0 && <Text className='tiny'>{services.length} 项</Text>}</View>
          {services.length ? <View className='store-service-list'>{services.map(item => <View className='store-service-card' key={item.id}>
            <View className='store-service-summary'>
              {item.image ? <Image className='store-service-image' src={item.image} mode='aspectFill' /> : <View className='store-service-placeholder'><Text>养护</Text></View>}
              <View className='store-service-info'>
                {item.category && <Text className='store-service-category'>{item.category}</Text>}
                <View className='card-title'>{item.name}</View>
                {item.subtitle && <View className='muted'>{item.subtitle}</View>}
                {item.duration && <Text className='store-service-duration'>参考时长 · {item.duration}</Text>}
              </View>
            </View>
            {expanded === item.id && <View className='store-service-detail'>
              {item.description && <View className='store-service-description'>{item.description}</View>}
              {!!item.steps?.length && <><View className='store-service-detail-label'>体验流程</View>{item.steps.map((step, index) => <View className='store-service-step' key={`${index}-${step}`}><Text>{String(index + 1).padStart(2, '0')}</Text><View>{step}</View></View>)}</>}
              {!item.description && !item.steps?.length && <View className='muted'>欢迎联系门店，了解项目详情与到店安排。</View>}
            </View>}
            <View className='store-service-actions'>
              <Button className='store-service-more' onClick={() => setExpanded(id => id === item.id ? '' : item.id)}>{expanded === item.id ? '收起详情 −' : '项目详情 +'}</Button>
              <Button className='store-service-book' onClick={() => book(store, item.id)}>{store.onlineBooking ? '申请预约' : '电话咨询'}</Button>
            </View>
          </View>)}</View> : <View className='store-services-empty'><View>本店养护项目正在完善中</View><Text>欢迎联系门店，了解适合您的养护与到店安排。</Text></View>}
        </View>
        {!!gallery.length && <View className='store-gallery'><View className='store-section-heading'><View className='heading'>门店环境</View><Text className='tiny'>{gallery.length} 张</Text></View><View className={`gallery${gallery.length === 1 ? ' single' : ''}`}>{gallery.map(src => <Image key={src} src={src} mode='aspectFill' onClick={() => { void Taro.previewImage({ current: src, urls: gallery }) }} />)}</View></View>}
        <CustomerService storeId={store.id} />
      </View>
    </> : <View className='section store-list'><View className='toolbar'>{['', ...new Set(stores.map(item => item.district))].map(value => <Button key={value} className={district === value ? 'active' : ''} onClick={() => setDistrict(value)}>{value || '全部区域'}</Button>)}</View>{stores.filter(item => !district || item.district === district).map(item => <View className='store-card' key={item.id}><Image src={item.image} mode='aspectFill' onClick={() => selectStore(item.id)} /><View className='card-body'><Text className='pill'>{item.district} · {item.tag}</Text><View className='heading'>{item.name}</View><View className='muted'>{item.address}</View><View className='tiny'>{item.hours}</View><View className='store-actions'><Button onClick={() => selectStore(item.id)}>门店详情</Button><Button className='green' onClick={() => book(item)}>{item.onlineBooking ? '申请预约' : '电话咨询'}</Button></View></View></View>)}{!stores.length && <View className='empty'>门店资料正在完善中。</View>}</View>}
  </View>
}
