import {readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const root=process.env.MINIPROGRAM_ROOT||'.', app=JSON.parse(await readFile(join(root,'app.json'),'utf8'))
const checked=[]
const excluded=new Set(['.git','node_modules','tools','docs','dist','logs','test-results','.taro','.swc'])
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(excluded.has(e.name))continue;const p=join(dir,e.name);if(e.isDirectory())await walk(p);else if(p.endsWith('.json'))JSON.parse(await readFile(p,'utf8'));else if(p.endsWith('.js'))new vm.Script(await readFile(p,'utf8'),{filename:p})}}
await walk(root)
for(const path of app.pages){
  let definition
  const source=await readFile(join(root,path+'.js'),'utf8'),markup=await readFile(join(root,path+'.wxml'),'utf8')
  vm.runInNewContext(source,{Page:p=>definition=p,require:()=>({day:()=> '2026-11-05'}),getApp:()=>({}),wx:{}})
  assert(definition && definition.data,`${path}: Page data`)
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
Object.assign(switched.data,{teacherIndex:1,teachers:[{...teacher,storeId:'shanghai'}],startTime:'10:00'})
switched.selectStoreId('changde')
assert.equal(switched.data.teacherIndex,0);assert.equal(switched.data.teachers.length,0);assert.equal(switched.data.startTime,'')
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
console.log(JSON.stringify({result:'PASS',pages:checked,nativeController:'therapist/member/pending/idempotency/double-tap/store-label/store-switch/stale-response/reschedule-owner-slots/reschedule-date-race/reschedule-double-tap',wechatCompilation:'NOT_RUN (requires WeChat Developer Tools and customer AppID)'},null,2))
