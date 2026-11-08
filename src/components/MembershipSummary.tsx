import {Text,View} from '@tarojs/components'
import type {AppointmentMembership} from '../types'
import {t} from '../i18n'

export default function MembershipSummary({member}:{member?:AppointmentMembership}){
  if(!member?.memberVerified)return null
  return <View className='banner membership-summary'>
    <Text>{member.crossStore?t('本次为会员跨店预约'):t('已核实会员')}</Text>
    <View className='tiny'>{member.memberStoreName?t('会员归属门店：{store}',{store:t(member.memberStoreName)}):t('会员归属门店待核实，不影响预约。')}</View>
  </View>
}
