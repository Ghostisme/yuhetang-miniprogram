import {readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const root=process.env.MINIPROGRAM_ROOT||'.', app=JSON.parse(await readFile(join(root,'app.json'),'utf8'))
const checked=[]
const excluded=new Set(['.git','node_modules','tools','docs','dist','logs','test-results','.taro','.swc'])
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(p.endsWith('.json'))JSON.parse(await readFile(p,'utf8'));else if(p.endsWith('.js'))new vm.Script(await readFile(p,'utf8'),{filename:p})}}
await walk(root)
// Cloud testing must use the cloud even in Developer Tools. Local access is explicit
// and may never leak to a device, a trial/release build or an unknown environment.
const configSource=await readFile(join(root,'config.js'),'utf8')
assert.match(configSource,/const useLocalBackend = false/,'the delivered client must default to the cloud')
const environments=[
  ['develop','devtools','https://booking.yuhetangtcm.com'],
  ['develop','ios','https://booking.yuhetangtcm.com'],
  ['develop','android','https://booking.yuhetangtcm.com'],
  ['trial','devtools','https://booking.yuhetangtcm.com'],
  ['trial','ios','https://booking.yuhetangtcm.com'],
  ['release','devtools','https://booking.yuhetangtcm.com'],
  ['release','android','https://booking.yuhetangtcm.com']
]
for(const localOptIn of [false,true])for(const [envVersion,platform,cloudExpected] of environments){
  const source=localOptIn?configSource.replace('const useLocalBackend = false','const useLocalBackend = true'):configSource
  const expected=localOptIn&&envVersion==='develop'&&platform==='devtools'?'http://127.0.0.1:8790':cloudExpected
  const module={exports:{}}
  vm.runInNewContext(source,{module,wx:{getAccountInfoSync:()=>({miniProgram:{envVersion}}),getDeviceInfo:()=>({platform})}})
  assert.equal(module.exports.apiBase,expected,`localOptIn=${localOptIn} ${envVersion}/${platform}: API origin`)
  assert.equal(module.exports.developmentLogin,false,'production must not enable mock customer login')
}
for(const localOptIn of [false,true])for(const wx of [{},{getAccountInfoSync:()=>{throw new Error('unsupported')}}]){
  const module={exports:{}}
  const source=localOptIn?configSource.replace('const useLocalBackend = false','const useLocalBackend = true'):configSource
  vm.runInNewContext(source,{module,wx})
  assert.equal(module.exports.apiBase,'https://booking.yuhetangtcm.com','unknown environment must use HTTPS')
}
// Verify API changes reach an already running client after the short TTL,
// simultaneous page reads share one request, and failed reads can retry.
let application,now=1000000
const reads=[]
vm.runInNewContext(await readFile(join(root,'app.js'),'utf8'),{
  App:value=>application=value,Date:{now:()=>now},
  require:()=>({media:value=>value,request:path=>new Promise((resolve,reject)=>reads.push({path,resolve,reject}))}),
  wx:{setNavigationBarColor:()=>{},setTabBarStyle:()=>{}}
})
const runtimeA=application.loadRuntime(),runtimeB=application.loadRuntime()
assert.equal(reads.length,1,'pages share the pending runtime request')
reads[0].resolve({customerTemplateIds:['old-result','old-reminder']})
await Promise.all([runtimeA,runtimeB])
await application.loadRuntime();assert.equal(reads.length,1,'repeat page reads use a short cache')
now+=60001
const failedRuntime=application.loadRuntime()
reads[1].reject(new Error('offline'))
await assert.rejects(failedRuntime,/offline/)
const refreshedRuntime=application.loadRuntime()
reads[2].resolve({customerTemplateIds:['new-result','new-reminder']})
assert.equal((await refreshedRuntime).customerTemplateIds[0],'new-result','new server template needs no code change')
assert.equal(application.runtimePromise,null,'failure cannot leave a permanently rejected request')
const siteA=application.loadSite(),siteB=application.loadSite()
assert.equal(reads.length,4,'pages share the pending brand request')
reads[3].resolve({brandName:'品牌',theme:'sage',version:1})
await Promise.all([siteA,siteB]);await application.loadSite()
assert.equal(reads.length,4)
const forcedSite=application.loadSite(true)
reads[4].resolve({brandName:'品牌',theme:'sand',version:2})
assert.equal((await forcedSite).version,2,'pull-to-refresh bypasses the client content cache')
let home,forceRequested=false
vm.runInNewContext(await readFile(join(root,'pages/home/index.js'),'utf8'),{
  Page:value=>home=value,require:()=>({}),wx:{stopPullDownRefresh:()=>{}},
  getApp:()=>({loadSite:async force=>{forceRequested=force;return {brandName:'新的品牌名',tagline:'新的介绍',services:[],stores:[],products:[]}}})
})
home.setData=patch=>Object.assign(home.data,patch)
await home.onPullDownRefresh()
assert.equal(forceRequested,true)
assert.equal(home.onShareAppMessage().title,'新的品牌名 · 新的介绍','share text follows published brand content')
const components=Object.entries(app.usingComponents||{})
assert.equal(app.usingComponents['customer-service'],'/components/customer-service/index','native contact must be registered for every page')
for(const [name,path] of components){
  const file=join(root,path.replace(/^\//,''))
  assert.equal(JSON.parse(await readFile(file+'.json','utf8')).component,true,`${name}: component config`)
  let definition
  vm.runInNewContext(await readFile(file+'.js','utf8'),{Component:c=>definition=c,require:()=>({})})
  const markup=await readFile(file+'.wxml','utf8')
  for(const match of markup.matchAll(/(?:bind|catch)(?::)?(?:tap|change|input|submit|blur|focus|confirm|load|error|contact)="(\w+)"/g))assert.equal(typeof definition.methods[match[1]],'function',`${name}: missing handler ${match[1]}`)
  assert(markup.includes('open-type="contact"'),'WeChat must open the native conversation')
  assert(markup.includes('session-from="{{sessionFrom}}"'),'native entry must include store context')
  const nativeButton=markup.match(/<button[^>]*open-type="contact"[^>]*>/)[0]
  assert(!/disabled=|bindtap=/.test(nativeButton),'native contact must remain directly usable without API login')
}
for(const path of app.pages){
  let definition
  const source=await readFile(join(root,path+'.js'),'utf8'),markup=await readFile(join(root,path+'.wxml'),'utf8')
  vm.runInNewContext(source,{Page:p=>definition=p,require:()=>({day:()=> '2026-11-05'}),getApp:()=>({}),wx:{}})
  assert(definition && definition.data,`${path}: Page data`)
  assert(markup.includes('<customer-service'),`${path}: direct native contact entry`)
  for(const match of markup.matchAll(/(?:bind|catch)(?::)?(?:tap|change|input|submit|blur|focus|confirm|load|error)="(\w+)"/g))assert.equal(typeof definition[match[1]],'function',`${path}: missing event ${match[1]}`)
  assert(!/<(?:br|div|span|h[1-6]|p)(?:[\s/>])/.test(markup),`${path}: web-only tag`)
  const stack=[]
  for(const match of markup.matchAll(/<\/?([a-z][\w-]*)(?:[^"'<>]|"[^"]*"|'[^']*')*\/?>/g)){
    const tag=match[1],text=match[0]
    if(text.startsWith('</'))assert.equal(stack.pop(),tag,`${path}: unbalanced ${tag}`)
    else if(!text.endsWith('/>'))stack.push(tag)
  }
  assert.equal(stack.length,0,`${path}: unclosed tags`)
  checked.push(path)
}

// Exercise the native Page controller with a wx harness. This does not replace WeChat compilation.
let page,payload,posts=0,releaseSubmit
const teacher={id:'yuyao-t1',storeId:'yuyao',storeName:'余姚路店',name:'测试老师',grade:'调理师',enabled:true,serviceIds:['moxa']}
const api={day:()=> '2026-11-05',id:()=> 'native-fixture-key',media:v=>v,login:async()=>{},privacy:async()=>{},subscribe:async()=>{},error:e=>{throw e},request:async(path,options={})=>{
  if(path.endsWith('/services'))return [{id:'moxa',name:'余姚路店本店艾灸',enabled:true}]
  if(path.endsWith('/therapists'))return [teacher]
  if(path.includes('/slots'))return {slots:[{time:'10:00',available:true,remaining:4}],rules:{advanceDays:7,maxHeadcount:4}}
  if(path==='/api/appointments'){posts++;payload=options;await new Promise(r=>releaseSubmit=r);return {id:'TEST-NATIVE',status:'PENDING',message:'等待门店人工确认'}}
  throw new Error('Unexpected path: '+path)
}}
vm.runInNewContext(await readFile(join(root,'pages/booking/index.js'),'utf8'),{require:()=>api,Page:p=>page=p,wx:{getStorageSync:()=> 'fixture-token',pageScrollTo:()=>{}},getApp:()=>({})})
page.setData=patch=>Object.assign(page.data,patch)
page.data.site={stores:[{id:'yuyao',onlineBooking:true,disabledServiceIds:[]}],services:[{id:'moxa',enabled:true}]}
page.selectStoreId('yuyao');await new Promise(r=>setImmediate(r))
assert.equal(page.data.teacherIndex,0)
page.data.serviceId='moxa';await page.loadTeachers()
assert.equal(page.data.teacherNames.length,2)
assert(page.data.teacherNames[1].includes(teacher.storeName),'native picker must show the therapist store')
Object.assign(page.data,{teacherIndex:1,startTime:'10:00',name:'原生验证客户',phone:'13800139001',memberIndex:0,visitedIndex:1,privacyConsent:true,key:'native-fixture-key'})
const first=page.submit();await new Promise(r=>setImmediate(r));await page.submit()
assert.equal(posts,1,'double tapping must not submit twice')
assert.equal(payload.headers['Idempotency-Key'],'native-fixture-key')
assert.equal(payload.data.therapistIntentId,teacher.id)
assert.equal(payload.data.memberClaim,'YES');assert.equal(payload.data.visitedClaim,'NO')
assert.equal(payload.data.privacyConsent,true)
releaseSubmit();await first
assert.equal(page.data.receipt.status,'PENDING');assert.equal(page.data.busy,false)
page.selectStoreId('yuyao');assert.equal(page.data.teacherIndex,0);assert.equal(page.data.startTime,'')
// Resolve the old store's responses after the new store to reproduce a slow-network switch.
const pending=new Map()
let switched
const raceApi={...api,request:async path=>new Promise(resolve=>pending.set(path,resolve))}
vm.runInNewContext(await readFile(join(root,'pages/booking/index.js'),'utf8'),{require:()=>raceApi,Page:p=>switched=p,wx:{},getApp:()=>({})})
switched.setData=patch=>Object.assign(switched.data,patch)
switched.data.site={stores:[{id:'shanghai',onlineBooking:true},{id:'changde',onlineBooking:true}],services:[{id:'moxa',enabled:true}]}
switched.data.serviceId='moxa'
switched.selectStoreId('shanghai')
pending.get('/api/stores/shanghai/services')([{id:'moxa',name:'上海中心门店项目',enabled:true}]);await new Promise(r=>setImmediate(r))
Object.assign(switched.data,{teacherIndex:1,teachers:[{...teacher,storeId:'shanghai'}],startTime:'10:00'})
switched.selectStoreId('changde')
assert.equal(switched.data.teacherIndex,0);assert.equal(switched.data.teachers.length,0);assert.equal(switched.data.startTime,'')
pending.get('/api/stores/changde/services')([{id:'moxa',name:'常德门店项目',enabled:true},{id:'changde-custom',name:'常德专属项目',enabled:true}]);await new Promise(r=>setImmediate(r))
const changdeTeacher={...teacher,id:'changde-t1',storeId:'changde',storeName:'常德路店'}
pending.get('/api/stores/changde/therapists')([changdeTeacher,{...teacher,storeId:'shanghai'}])
pending.get('/api/stores/changde/slots?date=2026-11-05')({slots:[{time:'11:00'}],rules:{advanceDays:7,maxHeadcount:4}})
await new Promise(r=>setImmediate(r))
pending.get('/api/stores/shanghai/therapists')([{...teacher,id:'shanghai-t1',storeId:'shanghai',storeName:'上海中心店'}])
pending.get('/api/stores/shanghai/slots?date=2026-11-05')({slots:[{time:'10:00'}],rules:{advanceDays:7,maxHeadcount:4}})
await new Promise(r=>setImmediate(r))
assert.equal(switched.data.storeId,'changde');assert.equal(switched.data.teachers.length,1)
assert.equal(switched.data.teachers[0].id,'changde-t1');assert.equal(switched.data.slots[0].time,'11:00')
assert.equal(switched.data.teachersLoading,false)
assert.equal(switched.data.services[0].name,'常德门店项目');assert.equal(switched.data.services[1].id,'changde-custom')
assert(!switched.data.services.some(s=>s.name==='上海中心门店项目'),'former store services must never overwrite selected store')
assert(switched.data.teacherNames[1].includes('常德路店'))
// Rescheduling must clear a former date immediately and ignore its late response.
let ordersPage,savePayload,savePosts=0,releaseSave
const timesPending=new Map(),order={id:'OWN-ORDER',storeId:'yuyao',bookingDate:'2026-11-05',headcount:4,version:2}
const ordersApi={...api,request:async(path,options={})=>{
  if(path.includes('/slots?date='))return new Promise(resolve=>timesPending.set(path,resolve))
  if(options.method==='PATCH'){savePosts++;savePayload=options.data;await new Promise(resolve=>releaseSave=resolve);return {}}
  throw new Error('Unexpected orders path: '+path)
}}
vm.runInNewContext(await readFile(join(root,'pages/orders/index.js'),'utf8'),{require:()=>ordersApi,Page:p=>ordersPage=p,wx:{showModal:()=>{}},getApp:()=>({})})
ordersPage.setData=patch=>Object.assign(ordersPage.data,patch)
Object.assign(ordersPage.data,{orders:[order],editing:order.id,date:order.bookingDate,times:['09:00']})
const oldTimes=ordersPage.loadTimes();assert.equal(ordersPage.data.times.length,0)
ordersPage.date({detail:{value:'2026-11-06'}})
timesPending.get('/api/me/appointments/OWN-ORDER/slots?date=2026-11-06')({slots:[{time:'11:00',available:true,remaining:4},{time:'12:00',available:false,remaining:4},{time:'13:00',available:true,remaining:3}],rules:{advanceDays:14}})
await new Promise(r=>setImmediate(r));assert.deepEqual([...ordersPage.data.times],['11:00'])
timesPending.get('/api/me/appointments/OWN-ORDER/slots?date=2026-11-05')({slots:[{time:'10:00',available:true,remaining:4}],rules:{advanceDays:7}})
await oldTimes;assert.deepEqual([...ordersPage.data.times],['11:00'],'late former date cannot overwrite reschedule times')
const saving=ordersPage.save();await new Promise(r=>setImmediate(r));await ordersPage.save()
assert.equal(savePosts,1);assert.equal(savePayload.date,'2026-11-06');assert.equal(savePayload.startTime,'11:00')
ordersPage.load=()=>{};releaseSave();await saving;assert.equal(ordersPage.data.editing,'')
// A late service response from the previous store cannot replace a new store's catalog.
let serviceRace
const servicesPending=new Map()
vm.runInNewContext(await readFile(join(root,'pages/booking/index.js'),'utf8'),{require:()=>({...api,request:async path=>path.endsWith('/services')?new Promise(resolve=>servicesPending.set(path,resolve)):api.request(path)}),Page:p=>serviceRace=p,wx:{},getApp:()=>({})})
serviceRace.setData=patch=>Object.assign(serviceRace.data,patch)
serviceRace.data.site={stores:[{id:'shanghai',onlineBooking:true},{id:'changde',onlineBooking:true}],services:[{id:'global-only',enabled:true}]}
serviceRace.data.serviceId='global-only';serviceRace.selectStoreId('shanghai');serviceRace.selectStoreId('changde')
servicesPending.get('/api/stores/changde/services')([{id:'custom-changde',enabled:true}]);await new Promise(r=>setImmediate(r))
servicesPending.get('/api/stores/shanghai/services')([{id:'custom-shanghai',enabled:true}]);await new Promise(r=>setImmediate(r))
assert.equal(serviceRace.data.services[0].id,'custom-changde');assert.equal(serviceRace.data.serviceId,'');assert.equal(serviceRace.data.servicesLoading,false)
// Native chat is guarded across store switches and double taps, including outstanding polls.
let chatPage,chatSends=0,releaseChatSend
const chatPending=new Map(),timers=new Map();let timerId=0
const chatApi={...api,request:async(path,options={})=>{
  if(path==='/api/me/chats')return {id:'conversation-'+options.data.storeId}
  if(options.method==='POST'){chatSends++;await new Promise(resolve=>releaseChatSend=resolve);return {id:'sent'}}
  return new Promise(resolve=>chatPending.set(path,resolve))
}}
vm.runInNewContext(await readFile(join(root,'pages/chat/index.js'),'utf8'),{require:()=>chatApi,Page:p=>chatPage=p,wx:{},setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id)})
chatPage.setData=patch=>Object.assign(chatPage.data,patch);chatPage.visible=true
Object.assign(chatPage.data,{storeId:'yuyao',stores:[{id:'yuyao'},{id:'bai-le-men'}]})
const oldChat=chatPage.open();await new Promise(r=>setImmediate(r))
chatPage.store({detail:{value:2}});await new Promise(r=>setImmediate(r))
chatPending.get('/api/me/chats/conversation-bai-le-men/messages?after=0')({items:[{id:'bai',seq:2,content:'本店咨询',direction:'IN'}]});await new Promise(r=>setImmediate(r))
chatPending.get('/api/me/chats/conversation-yuyao/messages?after=0')({items:[{id:'yuyao',seq:1,content:'其他门店咨询',direction:'IN'}]});await oldChat
assert.equal(chatPage.data.messages.length,1);assert.equal(chatPage.data.messages[0].id,'bai');assert.equal(chatPage.data.storeId,'bai-le-men')
chatPage.input({detail:{value:'预约咨询'}});const chatSending=chatPage.send();await new Promise(r=>setImmediate(r));await chatPage.send();assert.equal(chatSends,1)
releaseChatSend();await new Promise(r=>setImmediate(r))
chatPending.get('/api/me/chats/conversation-bai-le-men/messages?after=2')({items:[{id:'bai',seq:2,content:'本店咨询',direction:'IN'},{id:'mine',seq:3,content:'预约咨询',direction:'IN'}]});await chatSending
assert.equal(chatPage.data.messages.length,2,'poll/send overlap must deduplicate messages');assert.equal(chatPage.data.busy,false)
chatPage.stop();assert.equal(timers.size,0,'hidden chat must stop polling')
// A native entry must retain the selected store even when backend login is unavailable.
let native,onlineStore='',backendCalls=0
vm.runInNewContext(await readFile(join(root,'components/customer-service/index.js'),'utf8'),{
  Component:c=>native=c,require:()=>({contact:store=>onlineStore=store,login:()=>{backendCalls++;throw new Error('API unavailable')},request:()=>{backendCalls++;throw new Error('API unavailable')}})
})
native.setData=patch=>Object.assign(native.data,patch)
native.observers.storeId.call(native,'yuyao');assert.equal(native.data.sessionFrom,'yht-store:yuyao')
native.methods.nativeError.call(native);assert(native.data.error)
native.observers.storeId.call(native,'bai-le-men');assert.equal(native.data.sessionFrom,'yht-store:bai-le-men');assert.equal(native.data.error,'')
assert.equal(backendCalls,0,'preparing native contact cannot depend on the backend')
native.data.storeId='bai-le-men';native.methods.online.call(native);assert.equal(onlineStore,'bai-le-men','online fallback must retain store context')
native.observers.storeId.call(native,'');assert.equal(native.data.sessionFrom,'yht-store:','brand entry explicitly selects headquarters')
for(const [page,binding] of [['stores','{{selected.id}}'],['booking','{{storeId}}'],['orders','{{item.storeId}}'],['chat','{{storeId}}']]){
  const markup=await readFile(join(root,'pages',page,'index.wxml'),'utf8')
  assert(markup.includes('store-id="'+binding+'"'),`${page}: native store context`)
}
// Exercise the real subscription helper: a first-time customer, mixed choices,
// template deduplication, and rejection/failure must all retain their own meaning.
const storage=new Map(),subscriptionCalls=[],subscriptionPosts=[];let choice={},subscriptionApi
const subscriptionModule={exports:{}}
const subscriptionWx={
  getStorageSync:key=>storage.get(key)||'',setStorageSync:(key,value)=>storage.set(key,value),removeStorageSync:key=>storage.delete(key),
  login:options=>options.success({code:'fixture-code'}),showToast:()=>{},
  requestSubscribeMessage:options=>{subscriptionCalls.push([...options.tmplIds]);if(choice.fail)options.fail({errMsg:'cancel'});else options.success(choice)},
  request:options=>{
    if(options.url.endsWith('/api/auth/wechat'))return options.success({statusCode:200,data:{token:'subscription-fixture-token'}})
    assert(options.url.endsWith('/api/me/subscriptions'));subscriptionPosts.push(options.data)
    options.success({statusCode:200,data:{recorded:true}})
  }
}
vm.runInNewContext(await readFile(join(root,'utils/api.js'),'utf8'),{module:subscriptionModule,require:()=>({apiBase:'https://fixture.invalid',developmentLogin:false}),wx:subscriptionWx})
subscriptionApi=subscriptionModule.exports
choice={'result-template':'accept','reminder-template':'accept'}
const subscription=subscriptionApi.subscribe(['result-template','reminder-template','result-template',''])
assert.equal(subscriptionCalls.length,1,'subscription request must run inside the click, before awaiting login')
assert.deepEqual(subscriptionCalls[0],['result-template','reminder-template']);await subscription
assert.deepEqual(subscriptionPosts.map(p=>p.templateId).sort(),['reminder-template','result-template'])
assert.equal(storage.get('yht-token'),'subscription-fixture-token','first-time customers can record accepted subscriptions after login')
subscriptionPosts.length=0;choice={'result-template':'reject','reminder-template':'accept'}
await subscriptionApi.subscribe(['result-template','reminder-template'])
assert.deepEqual(subscriptionPosts.map(p=>p.templateId),['reminder-template'],'rejecting one template cannot create its allowance')
subscriptionPosts.length=0;choice={'result-template':'reject','reminder-template':'ban'}
await subscriptionApi.subscribe(['result-template','reminder-template']);assert.equal(subscriptionPosts.length,0)
choice={fail:true};await subscriptionApi.subscribe(['result-template','reminder-template']);assert.equal(subscriptionPosts.length,0)
choice={'result-template':'accept'};await subscriptionApi.subscribe('result-template');assert.equal(subscriptionPosts.length,1,'legacy single-template calls remain supported')
console.log(JSON.stringify({result:'PASS',pages:checked,components:components.map(([name])=>name),nativeController:'therapist/member/pending/idempotency/double-tap/store-label/store-switch/stale-response/reschedule-owner-slots/reschedule-date-race/reschedule-double-tap/store-services/service-race/chat-routing/chat-race/chat-double-tap/chat-deduplication/native-contact/no-login/store-context/online-fallback/dual-subscription/first-login/mixed-consent/rejected-consent',wechatCompilation:'NOT_RUN (requires WeChat Developer Tools compilation and device verification)'},null,2))
