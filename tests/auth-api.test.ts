import { i18nFixture } from './fixtures/i18n'
import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

// Exercise the actual Taro API adapter with a deterministic native SDK.
// No real login, subscription, customer message or network request is made.
function fixture({platform='weapp',code='one-use-wechat-code',initialToken=''}={}) {
  const storage=new Map<string,unknown>([['yht-session-context','https://fixture.invalid|wechat']])
  if(initialToken) { storage.set('yht-token',initialToken); storage.set('yht-login-consent',JSON.stringify({version:'2026-11-08'})) }
  const calls:any[]=[],listeners=new Set<()=>void>()
  let respond=async (input:any):Promise<any>=>({statusCode:200,header:{},data:input.url.endsWith('/api/auth/wechat')?{token:'new-wechat-session'}:[]})
  const sdk={
    getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,value),removeStorageSync:(key:string)=>storage.delete(key),
    eventCenter:{trigger:()=>listeners.forEach(fn=>fn()),on:(_name:string,fn:()=>void)=>listeners.add(fn),off:(_name:string,fn:()=>void)=>listeners.delete(fn)},
    login:async (options:any)=>{calls.push({type:'wx.login',options});return {code}},
    request:(input:any)=>{calls.push({type:'request',...input});return respond(input)},
    getCurrentPages:()=>[{route:'pages/booking/index',options:{storeId:'shanghai',serviceId:'care-1'}}],
    navigateTo:async (options:any)=>{calls.push({type:'navigate',...options})},
  }
  function load(path:string):any {
    const module={exports:{}},source=ts.transpileModule(readFileSync(resolve(path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
    const require=(name:string)=>{
      if(name==='@tarojs/taro')return {__esModule:true,default:sdk}
      if(name==='../utils/booking')return load('src/utils/booking.ts')
      if(name==='../utils/session')return load('src/utils/session.ts')
      if (name.endsWith('/i18n')) return i18nFixture
      if (name.endsWith('/components/LanguageSwitcher')) return { default: 'LanguageSwitcher' }
      throw new Error('Unexpected fixture import: '+name)
    }
    vm.runInNewContext(source,{module,exports:module.exports,require,API_BASE_URL:'https://fixture.invalid',ENABLE_DEV_LOGIN:false,process:{env:{TARO_ENV:platform}},console,Date,Math,setTimeout,clearTimeout})
    return module.exports
  }
  return {api:load('src/services/api.ts'),calls,storage,setRespond:(fn:typeof respond)=>{respond=fn}}
}

test('visiting as a guest cannot silently log in or fetch personal records',async()=>{
  const {api,calls}=fixture()
  assert.equal(api.hasCustomerSession(),false)
  await assert.rejects(api.login(),/请先登录/)
  await assert.rejects(api.request('/api/me/appointments'),/请先登录/)
  await assert.rejects(api.request('/api/appointments',{method:'POST',data:{}}),/请先登录/)
  await assert.rejects(api.authorizeCustomerLogin(false),/用户协议/)
  assert.equal(calls.length,0)
})

test('explicit consent exchanges one native code, then authenticates private requests with its session',async()=>{
  const {api,calls,storage}=fixture()
  const first=api.authorizeCustomerLogin(true),second=api.authorizeCustomerLogin(true)
  await Promise.all([first,second])
  assert.equal(calls.filter(c=>c.type==='wx.login').length,1)
  assert.equal(calls[0].options.timeout,10000)
  const exchanges=calls.filter(c=>c.url?.endsWith('/api/auth/wechat'))
  assert.equal(exchanges.length,1);assert.equal(exchanges[0].data.code,'one-use-wechat-code')
  assert(!JSON.stringify(exchanges[0].data).includes('secret'))
  await api.request('/api/me/appointments')
  assert.equal(calls[calls.length-1].header.Authorization,'Bearer new-wechat-session')
  assert(storage.has('yht-login-consent'))
})

test('empty native code and browser login never fabricate customer identities',async()=>{
  const empty=fixture({code:''})
  await assert.rejects(empty.api.authorizeCustomerLogin(true),/未完成/)
  assert.equal(empty.calls.filter(c=>c.type==='request').length,0)
  const browser=fixture({platform:'h5'})
  await assert.rejects(browser.api.authorizeCustomerLogin(true),/微信小程序内/)
  assert.equal(browser.calls.length,0)
})

test('a private 401 clears the expired session, notifies pages and does not retry login',async()=>{
  const {api,calls,setRespond}=fixture({initialToken:'expired-session'})
  let changes=0;const stop=api.watchCustomerSession(()=>{changes++})
  setRespond(async()=>({statusCode:401,header:{},data:{message:'expired'}}))
  await assert.rejects(api.request('/api/me/chats'),/重新登录/)
  assert.equal(api.hasCustomerSession(),false);assert.equal(changes,1)
  assert.equal(calls.filter(c=>c.type==='wx.login').length,0)
  stop()
})

test('logout discards an outstanding response containing another session\'s private data',async()=>{
  const {api,setRespond}=fixture({initialToken:'previous-customer'})
  let done!:(value:unknown)=>void
  setRespond(()=>new Promise(resolve=>{done=resolve}))
  const response=api.request('/api/me/appointments')
  api.logout()
  done({statusCode:200,header:{},data:[{id:'private-appointment'}]})
  await assert.rejects(response,/登录状态已更新/)
  assert.equal(api.hasCustomerSession(),false)
})

test('login navigation preserves a booking destination without calling WeChat',async()=>{
  const {api,calls}=fixture()
  await Promise.all([api.openCustomerLogin(),api.openCustomerLogin()])
  assert.equal(calls.length,1)
  assert.equal(calls[0].type,'navigate')
  assert.equal(decodeURIComponent(calls[0].url.split('returnTo=')[1]),'/pages/booking/index?storeId=shanghai&serviceId=care-1')
})
