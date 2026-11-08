import assert from 'node:assert/strict'
import {test} from 'node:test'
import {verifiedBookingMember} from '../src/utils/booking-member'
import type {CustomerProfile} from '../src/types'

const profile:CustomerProfile={name:'会员',phone:'13900004501',phoneVerified:true,memberVerified:true,memberStatus:'MEMBER',memberGrade:'年卡',sources:['MINIPROGRAM'],complete:true,firstLoginAt:'',lastLoginAt:'',development:false,memberStoreId:'shanghai',memberStoreName:'上海中心店'}
test('a verified member keeps recognition when selecting another receiving store',()=>assert.equal(verifiedBookingMember(profile,profile.phone),true))
test('changing the appointment contact does not transfer verified membership',()=>assert.equal(verifiedBookingMember(profile,'13900004502'),false))
test('unverified phone or membership never displays verified benefits',()=>{
  assert.equal(verifiedBookingMember({...profile,phoneVerified:false},profile.phone),false)
  assert.equal(verifiedBookingMember({...profile,memberVerified:false},profile.phone),false)
  assert.equal(verifiedBookingMember(null,profile.phone),false)
})
