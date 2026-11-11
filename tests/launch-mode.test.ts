import assert from 'node:assert/strict'
import { test } from 'node:test'
import { customerWrite, createLaunchNoticeMemory, launchCopy, type LaunchStatus } from '../src/utils/launch-mode'

const status: LaunchStatus = {enabled:true,revision:1,updatedAt:'fixture',title:{zh:'温馨提示',en:'Notice',ja:'ご案内'},message:{zh:'准备中',en:'Coming soon',ja:'準備中'}}
test('construction mode covers booking, profile, phone, subscription, chat and payment writes', () => {
  for (const path of ['/api/appointments','/api/me/profile','/api/me/profile/phone','/api/me/chat/entry','/api/me/chats/id/messages','/api/me/subscriptions','/api/me/appointments/id/payment/start','/api/auth/wechat']) assert.equal(customerWrite('POST',path),true,path)
  assert.equal(customerWrite('PATCH','/api/me/appointments/id'),true)
  assert.equal(customerWrite('DELETE','/api/me/wallet-service'),true)
})
test('construction mode preserves reads, administrator operations and signed WeChat callbacks', () => {
  for (const method of ['GET','HEAD','OPTIONS']) assert.equal(customerWrite(method,'/api/me/profile'),false)
  for (const path of ['/api/admin/launch-mode','/api/admin/appointments','/api/wechat/customer-service','/api/wechat/service/messages','/api/integrations/ku52-sync']) assert.equal(customerWrite('POST',path),false)
})
test('native reminder is announced once across tabs and again for new text, locale or activation', () => {
  const remember=createLaunchNoticeMemory()
  assert.equal(remember(status,'zh'),true);assert.equal(remember(status,'zh'),false)
  assert.equal(remember(status,'en'),true)
  assert.equal(remember({...status,revision:2},'en'),true)
  assert.equal(remember({...status,enabled:false},'en'),false)
  assert.equal(remember(status,'en'),true)
})
test('the notice uses all three languages with Chinese fallback', () => {
  for (const locale of ['zh','en','ja'] as const) assert.equal(launchCopy(status,locale).message,status.message[locale])
  assert.equal(launchCopy({...status,message:{...status.message,en:''}},'en').message,'准备中')
})
