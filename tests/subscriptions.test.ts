import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'
import type {SubscriptionResult,SubscriptionSettings} from '../src/services/api'

// Run the real API module with a fixture Taro SDK: no WeChat or HTTP calls escape.
async function fixture({failRecord=false,failNative=false}={}){
  const calls:{kind:string;data?:Record<string,unknown>}[]=[],storage=new Map<string,unknown>()
  let options:any
  const sdk={
    getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,value),removeStorageSync:(key:string)=>storage.delete(key),
    requestSubscribeMessage:(value:any)=>{calls.push({kind:'subscribe'});options=value;if(failNative)return Promise.reject({errMsg:'requestSubscribeMessage:fail setting disabled'})},
    getSetting:(value:any)=>{calls.push({kind:'read-settings',data:value});if(failNative)return Promise.reject({errMsg:'getSetting:fail'});value.success({subscriptionsSetting:{mainSwitch:false,itemSettings:{result:'reject'}}})},
    openSetting:(value:any)=>{calls.push({kind:'open-settings',data:value});if(failNative)return Promise.reject({errMsg:'openSetting:fail'});value.success({subscriptionsSetting:{mainSwitch:true,itemSettings:{result:'accept',reminder:'accept'}}})},
    login:async()=>{calls.push({kind:'login'});return {code:'fixture-code'}},
    request:async(value:any)=>{
      calls.push({kind:value.url.endsWith('/api/auth/wechat')?'authenticate':'record',data:value.data})
      if(value.url.endsWith('/api/auth/wechat'))return {statusCode:200,data:{token:'fixture-token'},header:{}}
      if(failRecord)return {statusCode:503,data:{message:'保存提醒失败'},header:{}}
      return {statusCode:200,data:{recorded:true},header:{}}
    },
    showToast:async()=>{calls.push({kind:'toast'})},
  }
  function load(path:string):any{
    const module={exports:{}},source=ts.transpileModule(readFileSync(resolve(path),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
    const require=(name:string)=>{
      if(name==='@tarojs/taro')return {__esModule:true,default:sdk}
      if(name==='../utils/booking')return load('src/utils/booking.ts')
      if(name==='../utils/session')return load('src/utils/session.ts')
      throw new Error('Unexpected fixture import: '+name)
    }
    vm.runInNewContext(source,{module,exports:module.exports,require,API_BASE_URL:'https://fixture.invalid',ENABLE_DEV_LOGIN:false,process:{env:{TARO_ENV:'weapp'}},console,Date,Math,setTimeout,clearTimeout})
    return module.exports
  }
  const api=load('src/services/api.ts')
  return {subscribe:api.subscribe as (ids:string[])=>Promise<SubscriptionResult>,readSettings:api.readSubscriptionSettings as ()=>Promise<SubscriptionSettings|null>,openSettings:api.openSubscriptionSettings as ()=>Promise<SubscriptionSettings|null>,calls,get options(){return options}}
}

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
  assert.deepEqual(state.calls.slice(0,3).map(c=>c.kind),['subscribe','login','authenticate'])
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
