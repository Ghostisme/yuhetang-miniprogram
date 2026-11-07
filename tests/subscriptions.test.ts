import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import ts from 'typescript'
import type {SubscriptionResult} from '../src/services/api'

// Run the real API module with a fixture Taro SDK: no WeChat or HTTP calls escape.
async function fixture({failRecord=false}={}){
  const calls:{kind:string;data?:Record<string,unknown>}[]=[],storage=new Map<string,unknown>()
  let options:any
  const sdk={
    getStorageSync:(key:string)=>storage.get(key),setStorageSync:(key:string,value:unknown)=>storage.set(key,value),removeStorageSync:(key:string)=>storage.delete(key),
    requestSubscribeMessage:(value:any)=>{calls.push({kind:'subscribe'});options=value},
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
  return {subscribe:load('src/services/api.ts').subscribe as (ids:string[])=>Promise<SubscriptionResult>,calls,get options(){return options}}
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
