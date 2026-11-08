import { useState } from 'react'
import { useDidShow } from '@tarojs/taro'
import { Picker, Text, View } from '@tarojs/components'
import { ContactChannels } from '../../components/CustomerService'
import PageState from '../../components/PageState'
import { useSite } from '../../hooks/useSite'
import { contactState, themeStyle } from '../../services/site'
import './index.scss'

export default function Contact() {
  const { site, error, refresh } = useSite()
  const [storeId, setStoreId] = useState(contactState.storeId)
  useDidShow(() => setStoreId(contactState.storeId))
  if (!site) return <PageState error={error} retry={() => { void refresh(true) }} />
  const stores = site.stores.filter(item => item.enabled)
  const store = stores.find(item => item.id === storeId)
  const names = ['品牌客服 · 总部接待', ...stores.map(item => item.name)]
  return <View className='page contact-page' style={themeStyle(site)}>
    <View className='page-heading'><Text className='eyebrow'>ALWAYS HERE FOR YOU</Text><View className='heading'>您的需要，我们在听</View><View className='muted'>预约、养护与到店安排，都可以在这里聊聊。</View></View>
    <View className='contact-center-body'>
      <Picker range={names} value={stores.findIndex(item => item.id === store?.id) + 1} onChange={e => { const id = stores[Number(e.detail.value) - 1]?.id || ''; contactState.storeId = id; setStoreId(id) }}><View className='contact-store-picker'><View><Text className='contact-store-label'>接待门店</Text><View className='contact-store-name'>{store?.name || names[0]}</View></View><Text className='contact-store-change'>切换 ›</Text></View></Picker>
      <ContactChannels key={store?.id || 'brand'} site={site} storeId={store?.id} />
      <View className='contact-center-note'><Text>每一次沟通，都认真对待</Text><View>{store?.hours ? `门店营业时间 ${store.hours}` : '门店工作人员会在营业时间为您回复。'}</View></View>
    </View>
  </View>
}
