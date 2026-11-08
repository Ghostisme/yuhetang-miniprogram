import { i18nFixture } from './fixtures/i18n'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'
import type {SubscriptionResult,SubscriptionSettings} from '../src/services/api'

// Run the real API module with a fixture Taro SDK: no WeChat or HTTP calls escape.
async function fixture({failRecord=false,failNative=false,signedIn=true}={}){
  const calls:{kind:string;data?:Record<string,unknown>}[]=[],storage=new Map<string,unknown>()
  storage.set('yht-session-context','https://fixture.invalid|wechat')
  if(signedIn) { storage.set('yht-token','fixture-token'); storage.set('yht-login-consent',JSON.stringify({version:'2026-11-08'})) }
  let options:any
  const sdk={
    getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,value),removeStorageSync:(key:string)=>storage.delete(key),
    requestSubscribeMessage:(value:any)=>{calls.push({kind:'subscribe'});options=value;if(failNative)return Promise.reject({errMsg:'requestSubscribeMessage:fail setting disabled'})},
    getSetting:(value:any)=>{calls.push({kind:'read-settings',data:value});if(failNative)return Promise.reject({errMsg:'getSetting:fail'});value.success({subscriptionsSetting:{mainSwitch:false,itemSettings:{result:'reject'}}})},
    openSetting:(value:any)=>{calls.push({kind:'open-settings',data:value});if(failNative)return Promise.reject({errMsg:'openSetting:fail'});value.success({subscriptionsSetting:{mainSwitch:true,itemSettings:{result:'accept',reminder:'accept'}}})},
    login:async()=>{calls.push({kind:'login'});return {code:'fixture-code'}},
    request:async(value:any)=>{
      const kind=value.url.endsWith('/api/auth/wechat')?'authenticate':value.url.endsWith('/api/appointments')?'booking':value.url.includes('/api/me/appointments/')?'reschedule':'record'
      calls.push({kind,data:value.data})
      if(value.url.endsWith('/api/auth/wechat'))return {statusCode:200,data:{token:'fixture-token'},header:{}}
      if(kind==='booking')return {statusCode:200,data:{id:'fixture-booking'},header:{}}
      if(kind==='reschedule')return {statusCode:200,data:{id:'fixture-booking',version:2},header:{}}
      if(failRecord)return {statusCode:503,data:{message:'保存提醒失败'},header:{}}
      return {statusCode:200,data:{recorded:true},header:{}}
    },
    showToast:async()=>{calls.push({kind:'toast'})},
    eventCenter:{trigger:()=>{}},
  }
  function load(path:string):any{
    const module={exports:{}},source=ts.transpileModule(readFileSync(resolve(path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
    const require=(name:string)=>{
      if(name==='@tarojs/taro')return {__esModule:true,default:sdk}
      if(name==='../utils/booking')return load('src/utils/booking.ts')
      if(name==='../utils/session')return load('src/utils/session.ts')
      if (name.endsWith('/i18n')) return i18nFixture
      if (name.endsWith('/components/LanguageSwitcher')) return { default: 'LanguageSwitcher' }
      throw new Error('Unexpected fixture import: '+name)
    }
    vm.runInNewContext(source,{module,exports:module.exports,require,API_BASE_URL:'https://fixture.invalid',ENABLE_DEV_LOGIN:false,process:{env:{TARO_ENV:'weapp'}},console,Date,Math,Error,setTimeout,clearTimeout})
    return module.exports
  }
  const api=load('src/services/api.ts')
  return {api,subscribe:api.subscribe as (ids:string[])=>Promise<SubscriptionResult>,logout:api.logout as ()=>void,readSettings:api.readSubscriptionSettings as ()=>Promise<SubscriptionSettings|null>,openSettings:api.openSubscriptionSettings as ()=>Promise<SubscriptionSettings|null>,calls,get options(){return options}}
}

// Execute the real page action against the real API adapter and fixture SDK.
// This catches an await/login/HTTP introduced before the native click gesture.
function pageAction(path:string,name:string,bindings:Record<string,unknown>):()=>Promise<void>{
  const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let action:ts.FunctionDeclaration|undefined
  function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)action=node;ts.forEachChild(node,visit)}
  visit(file);assert(action,`Missing ${name} action in ${path}`)
  const source=ts.transpileModule(action.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  return vm.runInNewContext(source+'\n'+name,{...i18nFixture,...bindings})
}

function bookingAction(state:Awaited<ReturnType<typeof fixture>>){
  const result:{receipt?:{id:string};subscription?:SubscriptionResult;login?:boolean;errors:unknown[]}={errors:[]}
  const sending={current:false},runtime={customerTemplateId:'result',customerReminderTemplateId:'reminder',customerTemplateIds:[]}
  const bindings={
    sending,runtime,hasCustomerSession:state.api.hasCustomerSession,setLoginOpen:(value:boolean)=>{result.login=value},
    store:{id:'shanghai'},service:{id:'care-1'},storeId:'shanghai',serviceId:'care-1',date:'2030-01-02',time:'15:00',headcount:1,
    teachers:[],teacherId:'',servicesLoading:false,teachersLoading:false,slotsLoading:false,
    slots:{slots:[{time:'15:00',available:true,remaining:4}]},name:'测试客户',phone:'13900003001',consent:true,sensitive:false,
    claims:['YES','NO','UNKNOWN'],member:2,visited:2,remark:'',key:{current:'booking-fixture-key'},
    subscribeBooking:state.api.subscribeBooking,request:state.api.request,
    privacy:async()=>{state.calls.push({kind:'privacy'})},setBusy:()=>{},setError:()=>{},
    setReceipt:(value:{id:string})=>{result.receipt=value},setSubscriptionResult:(value:SubscriptionResult)=>{result.subscription=value},
    toastError:(error:unknown)=>result.errors.push(error),message:(error:Error)=>error.message,retry:()=>{},
  }
  return {bindings,result,submit:()=>pageAction('src/pages/booking/index.tsx','submit',bindings)()}
}

test('booking submit directly opens one native prompt with both reminder templates before HTTP or privacy awaits',async()=>{
  const state=await fixture(),booking=bookingAction(state)
  const submitted=booking.submit();await booking.submit()
  assert.deepEqual(state.calls.map(c=>c.kind),['subscribe'])
  assert.deepEqual(Array.from(state.options.tmplIds),['result','reminder'],'Legacy runtime fields still include the arrival reminder when its array is empty')
  await state.options.success({result:'accept',reminder:'accept'});await submitted
  assert.deepEqual(state.calls.map(c=>c.kind),['subscribe','record','record','privacy','booking'])
  assert.equal(booking.result.receipt?.id,'fixture-booking');assert.equal(booking.result.subscription?.recorded,2)
  assert.equal(state.calls.filter(c=>c.kind==='booking').length,1);assert.deepEqual(booking.result.errors,[])
})

test('declining, cancelling or an unavailable native prompt still submits the booking once',async()=>{
  for(const outcome of ['reject','cancel','failure']){
    const state=await fixture({failNative:outcome==='failure'}),booking=bookingAction(state),submitted=booking.submit()
    if(outcome==='reject')await state.options.success({result:'reject',reminder:'reject'})
    if(outcome==='cancel')state.options.fail({errMsg:'requestSubscribeMessage:fail cancel'})
    await submitted
    assert.equal(booking.result.receipt?.id,'fixture-booking');assert.equal(booking.result.subscription?.recorded,0)
    assert.deepEqual(state.calls.map(c=>c.kind),['subscribe','privacy','booking']);assert.deepEqual(booking.result.errors,[])
  }
})

test('invalid booking data or a guest submission cannot request subscriptions or create an appointment',async()=>{
  const state=await fixture(),invalid=bookingAction(state);invalid.bindings.phone='123';await invalid.submit()
  assert.equal(invalid.result.errors.length,1);assert.equal(state.calls.length,0)
  const guest=await fixture({signedIn:false}),booking=bookingAction(guest);await booking.submit()
  assert.equal(booking.result.login,true);assert.equal(guest.calls.length,0)
})

test('missing template configuration or failed grant persistence never makes booking depend on manual subscription',async()=>{
  const unconfigured=await fixture(),booking=bookingAction(unconfigured)
  booking.bindings.runtime={customerTemplateId:'',customerReminderTemplateId:'',customerTemplateIds:[]}
  await booking.submit()
  assert.deepEqual(unconfigured.calls.map(c=>c.kind),['privacy','booking'])
  assert.equal(booking.result.receipt?.id,'fixture-booking')
  const disconnected=await fixture({failRecord:true}),retry=bookingAction(disconnected),submitted=retry.submit()
  await disconnected.options.success({result:'accept',reminder:'accept'});await submitted
  assert.equal(retry.result.receipt?.id,'fixture-booking')
  assert.equal(retry.result.subscription?.recorded,0)
  assert.equal(disconnected.calls.filter(c=>c.kind==='booking').length,1)
  assert.deepEqual(retry.result.errors,[])
})

test('reschedule submit requests reminders in its click and continues if the customer declines',async()=>{
  const state=await fixture(),sending={current:false},refreshes:unknown[]=[]
  const save=pageAction('src/pages/orders/index.tsx','save',{
    sending,editing:{id:'fixture-booking',version:1},times:['15:00'],timeIndex:0,timesLoading:false,date:'2030-01-02',
    runtime:{customerTemplateIds:['result','reminder']},hasCustomerSession:state.api.hasCustomerSession,allowed:()=>true,
    subscribeBooking:state.api.subscribeBooking,request:state.api.request,setBusy:()=>{},setEditing:()=>{},
    load:async()=>{refreshes.push('loaded')},Taro:{showModal:async()=>{}},toastError:(error:Error)=>{throw error},
  })
  const saved=save();assert.deepEqual(state.calls.map(c=>c.kind),['subscribe'])
  assert.deepEqual(Array.from(state.options.tmplIds),['result','reminder'])
  await state.options.success({result:'reject',reminder:'reject'});await saved
  assert.deepEqual(state.calls.map(c=>c.kind),['subscribe','reschedule']);assert.equal(refreshes.length,1)
})

test('subscription prompt starts in the click stack, deduplicates clicks and saves only accepted templates',async()=>{
  const state=await fixture(),promise=state.subscribe(['result','reminder'])
  assert.deepEqual(state.calls.map(c=>c.kind),['subscribe'])
  assert.equal(state.subscribe(['result','reminder']),promise)
  await state.options.success({result:'accept',reminder:'reject'})
  const outcome=await promise
  assert.equal(outcome.recorded,1);assert.equal(outcome.declined,1)
  const records=state.calls.filter(c=>c.kind==='record')
  assert.equal(records.length,1);assert.equal(records[0].data?.templateId,'result')
  assert.match(String(records[0].data?.requestId),/^[A-Za-z0-9_-]{16,64}$/)
  assert.deepEqual(state.calls.map(c=>c.kind),['subscribe','record'],'Subscription uses the agreed customer session and never starts a silent login')
})

test('a reschedule that crossed its cutoff cannot open a subscription prompt or mutate a booking',async()=>{
  const state=await fixture(),save=pageAction('src/pages/orders/index.tsx','save',{
    sending:{current:false},editing:{id:'fixture-booking',version:1},times:['15:00'],timeIndex:0,timesLoading:false,
    hasCustomerSession:state.api.hasCustomerSession,allowed:()=>false,
  })
  await save();assert.equal(state.calls.length,0)
})

test('declining or cancelling subscription resolves normally and never records a grant',async()=>{
  for(const cancel of [false,true]){
    const state=await fixture(),promise=state.subscribe(['result'])
    if(cancel)state.options.fail({errMsg:'requestSubscribeMessage:fail cancel'})
    else await state.options.success({result:'reject'})
    const outcome=await promise
    assert.equal(outcome.recorded,0);assert.equal(outcome.accepted,0);assert.equal(outcome.error,undefined)
    assert.deepEqual(state.calls.map(c=>c.kind),['subscribe'])
  }
})

test('failed grant persistence is reported without rejecting the booking workflow or silently retrying',async()=>{
  const state=await fixture({failRecord:true}),promise=state.subscribe(['result','reminder'])
  await state.options.success({result:'accept',reminder:'accept'})
  const outcome=await promise
  assert.equal(outcome.accepted,2);assert.equal(outcome.recorded,0);assert(outcome.error)
  assert.equal(state.calls.filter(c=>c.kind==='record').length,2)
  assert.equal(state.calls.filter(c=>c.kind==='toast').length,1)
})

test('remembered settings and enabling the master switch never create one-time subscription allowances',async()=>{
  const state=await fixture(),read=await state.readSettings()
  assert.equal(read?.enabled,false);assert.equal(read?.choices.result,'reject')
  const opening=state.openSettings()
  assert.equal(state.calls[state.calls.length-1]?.kind,'open-settings','Native settings must start synchronously from the click')
  const settings=await opening
  assert.equal(settings?.enabled,true);assert.equal(settings?.choices.result,'accept')
  assert(state.calls.every(c=>c.data?.withSubscriptions===true))
  assert.equal(state.calls.filter(c=>['subscribe','login','record'].includes(c.kind)).length,0)
  const subscribing=state.subscribe(['result','reminder'])
  await state.options.success({result:'accept',reminder:'accept'})
  assert.equal((await subscribing).recorded,2,'Only an actual native subscription result can record allowances')
})

test('banned or filtered templates do not count as accepted or silently hide partial results',async()=>{
  for(const unavailable of ['ban','filter']){
    const state=await fixture(),promise=state.subscribe(['result','reminder'])
    await state.options.success({result:'accept',reminder:unavailable})
    const outcome=await promise
    assert.equal(outcome.recorded,1);assert.equal(outcome.declined,1);assert.match(outcome.error||'',/模板暂不可用/)
    assert.equal(state.calls.filter(c=>c.kind==='record').length,1)
  }
})

test('native Promise failures are handled without blocking booking or fabricating accepted grants',async()=>{
  const state=await fixture({failNative:true}),result=await state.subscribe(['result'])
  assert.equal(result.recorded,0);assert.match(result.error||'',/订阅未开启/)
  assert.equal(await state.readSettings(),null)
  await assert.rejects(state.openSettings(),/无法打开微信订阅设置/)
  assert.equal(state.calls.filter(c=>['login','record'].includes(c.kind)).length,0)
})

test('a guest cannot open the native subscription prompt before explicitly logging in',async()=>{
  const state=await fixture({signedIn:false}),result=await state.subscribe(['result'])
  assert.equal(result.accepted,0);assert.equal(result.recorded,0);assert.match(result.error||'',/请先登录/)
  assert.equal(state.calls.length,0)
})

test('logging out while the native prompt is open cannot record grants against another session',async()=>{
  const state=await fixture(),promise=state.subscribe(['result'])
  state.logout()
  await state.options.success({result:'accept'})
  const result=await promise
  assert.equal(result.accepted,1);assert.equal(result.recorded,0);assert.match(result.error||'',/登录状态已更新/)
  assert.equal(state.calls.filter(c=>['login','authenticate','record'].includes(c.kind)).length,0)
})
