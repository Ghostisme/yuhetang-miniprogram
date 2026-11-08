import { t, useI18n } from '../../i18n'
import { useState } from 'react'
import { useDidHide } from '@tarojs/taro'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import { call, contact, isWeapp } from '../../services/api'
import { contactState } from '../../services/site'
import { message } from '../../utils/booking'
import type { Site } from '../../types'
import contactIcon from '../../assets/tabbar/contact-active.png'
import './index.scss'

export function ContactChannels({ site, storeId = '', showOnline = true, onNavigate }: { site: Site; storeId?: string; showOnline?: boolean; onNavigate?: () => void }) {
  useI18n()
  const [error, setError] = useState(''), [opening, setOpening] = useState(false)
  const store = site.stores.find(item => item.enabled && item.id === storeId)
  const target = store?.id || '', phone = store ? store.phone : site.contact.phone
  async function online() {
    if (opening) return
    setOpening(true); setError(''); contactState.storeId = target
    try { await contact(target); onNavigate?.() }
    catch (error) { setError(message(error)) }
    finally { setOpening(false) }
  }
  return <View className='contact-channels'>
    {showOnline && <Button className='contact-channel contact-channel-online' disabled={opening} loading={opening} onClick={() => { void online() }}><View className='contact-channel-icon'><Image src={contactIcon} /></View><View className='contact-channel-copy'><Text className='contact-channel-title'>{t("在线咨询")}</Text><Text className='contact-channel-description'>{t("向门店留言，查看咨询与接待记录")}</Text></View><Text className='contact-channel-chevron'>›</Text></Button>}
    {isWeapp && <Button className='contact-channel contact-channel-wechat' openType='contact' sessionFrom={`yht-store:${target}`} onContact={onNavigate} onError={() => setError(t('暂时无法打开微信客服，请选择其他联系方式。'))}><View className='contact-channel-icon contact-wechat-icon'><View /><View /></View><View className='contact-channel-copy'><Text className='contact-channel-title'>{t("微信客服")}</Text><Text className='contact-channel-description'>{t("打开微信客服窗口，与我们沟通")}</Text></View><Text className='contact-channel-chevron'>›</Text></Button>}
    {!!phone && <Button className='contact-phone' onClick={() => { contactState.storeId = target; call(phone) }}><Text>{t("电话联系")}</Text><Text>{phone}</Text><Text>›</Text></Button>}
    {!isWeapp && <Text className='contact-platform-note'>{t("微信客服请在微信小程序内使用。")}</Text>}
    {!showOnline && !isWeapp && !phone && <Text className='contact-platform-note'>{t("门店电话正在完善中，可先在当前页面留言。")}</Text>}
    {error && <Text className='contact-error'>{t(error)}</Text>}
  </View>
}

export default function CustomerService({ site, storeId = '', variant = 'inline', showOnline = true, label = t('客服') }: { site: Site | null; storeId?: string; variant?: 'inline' | 'dock'; showOnline?: boolean; label?: string }) {
  useI18n()
  const [open, setOpen] = useState(false)
  useDidHide(() => setOpen(false))
  const store = site?.stores.find(item => item.enabled && item.id === storeId)
  return <View className={`customer-service customer-service--${variant}`}>
    <Button className='contact-entry' onClick={() => { setOpen(true); contactState.storeId = store?.id || '' }}><Image src={contactIcon} /><Text>{label}</Text></Button>
    {open && <View className='contact-overlay'>
      <View className='contact-mask' catchMove onClick={() => setOpen(false)} />
      <View className='contact-sheet'>
        <View className='contact-sheet-header'><View><View className='contact-sheet-title'>{t("联系门店")}</View><Text className='contact-sheet-subtitle'>{store?.name || t('品牌客服 · 总部接待')}</Text></View><Button className='contact-sheet-close' ariaLabel={t('关闭联系方式')} onClick={() => setOpen(false)}>×</Button></View>
        <ScrollView className='contact-sheet-body' scrollY bounces={false} enhanced>
          {site ? <ContactChannels key={store?.id || 'brand'} site={site} storeId={store?.id} showOnline={showOnline} onNavigate={() => setOpen(false)} /> : <View className='contact-loading'>{t("正在准备联系方式，请稍候…")}</View>}
        </ScrollView>
        <Button className='contact-sheet-cancel' onClick={() => setOpen(false)}>{t("暂不联系")}</Button>
      </View>
    </View>}
  </View>
}
