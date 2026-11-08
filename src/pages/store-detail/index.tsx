import { useState } from 'react'
import Taro, { useRouter } from '@tarojs/taro'
import { Button, Image, Text, View } from '@tarojs/components'
import CustomerService from '../../components/CustomerService'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { themeStyle } from '../../services/site'
import { call, toastError } from '../../services/api'
import './index.scss'

export default function StoreDetail() {
  const { params } = useRouter()
  const { site, error, refresh } = useSite()
  const [expanded, setExpanded] = useState('')
  async function backToList() {
    const pages = Taro.getCurrentPages(), previous = pages[pages.length - 2]
    if (previous?.route?.replace(/^\//, '') === 'pages/stores/index') {
      try { await Taro.navigateBack({ delta: 1 }); return } catch { /* A direct entry has no list in its navigation stack. */ }
    }
    await Taro.switchTab({ url: '/pages/stores/index' }).catch(toastError)
  }
  if (!site) return <PageState error={error} retry={() => void refresh(true)} />
  const store = site.stores.find(item => item.enabled && item.id === params.storeId)
  const services = (store?.services || []).filter(item => item.enabled)
  const gallery = [...new Set((store?.gallery || []).map(url => url.trim()).filter(Boolean))]
  const book = (serviceId = '') => {
    if (!store) return
    if (!store.onlineBooking) return call(store.phone)
    void Taro.navigateTo({ url: `/pages/booking/index?storeId=${encodeURIComponent(store.id)}&serviceId=${encodeURIComponent(serviceId)}` }).catch(toastError)
  }
  return <View className='page stores-page store-detail-page' style={themeStyle(site)}>
    <View className='store-detail-navigation'><Button className='store-list-return' onClick={() => void backToList()}><Text className='return-chevron'>‹</Text>返回门店列表</Button><Text className='tiny'>{store?.district || '门店空间'}</Text></View>
    {store ? <>
      <Image className='cover store-detail-cover' src={store.image} mode='aspectFill' />
      <View className='article'>
        <View className='heading'>{store.name}</View><View className='description'>{store.description}</View>
        <View className='store-meta'><View className='info'>营业时间　{store.hours}</View><View className='info'>{store.address}</View></View>
        <View className='store-actions'><Button onClick={() => call(store.phone)}>致电门店</Button><Button onClick={() => { if (!store.latitude || !store.longitude) return toastError(new Error('门店地图位置待完善，请致电咨询。')); void Taro.openLocation({ latitude: store.latitude, longitude: store.longitude, name: store.name, address: store.address }).catch(toastError) }}>地图导航</Button><Button className='green' onClick={() => book()}>{store.onlineBooking ? '申请预约' : '电话咨询'}</Button></View>
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
              <Button className='store-service-book' onClick={() => book(item.id)}>{store.onlineBooking ? '申请预约' : '电话咨询'}</Button>
            </View>
          </View>)}</View> : <View className='store-services-empty'><View>本店养护项目正在完善中</View><Text>欢迎联系门店，了解适合您的养护与到店安排。</Text></View>}
        </View>
        {!!gallery.length && <View className='store-gallery'><View className='store-section-heading'><View className='heading'>门店环境</View><Text className='tiny'>{gallery.length} 张</Text></View><View className={`gallery${gallery.length === 1 ? ' single' : ''}`}>{gallery.map(src => <Image key={src} src={src} mode='aspectFill' onClick={() => { void Taro.previewImage({ current: src, urls: gallery }) }} />)}</View></View>}
      </View>
    </> : <View className='empty'><View className='empty-title'>暂未找到这家门店</View><Text>门店资料可能已调整，请返回列表选择其他门店。</Text><Button className='primary' onClick={() => void backToList()}>查看全部门店</Button></View>}
    {store && <CustomerService site={site} storeId={store.id} variant='dock' />}
  </View>
}
