import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve, sep, extname} from 'node:path'
import {assertFullText} from './ui-fit.mjs'

// Real compiled UI; every HTTP request is fulfilled locally or blocked.
const origin='http://127.0.0.1:5182',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/launch-mode')
await mkdir(output,{recursive:true})
const dictionary={...JSON.parse(await readFile('src/i18n/content.json','utf8')),...JSON.parse(await readFile('src/i18n/messages.json','utf8'))}
const tr=(text,lang)=>lang==='zh'?text:dictionary[text]?.[lang]||text
const labels={zh:'中文',en:'English',ja:'日本語'}
const image=await readFile('src/assets/login/reception.jpg')
const care={id:'care-1',name:'中医推拿',category:'特色养护',enabled:true,image:origin+'/fixture/care.jpg',subtitle:'循着身体的节奏，找到自己的放松方式。',description:'预约、项目和到店安排，都可以在这里咨询。',duration:'60分钟',steps:['中医推拿','预约体验']}
const store={id:'shanghai',name:'上海中心店',district:'浦东新区',enabled:true,onlineBooking:true,image:origin+'/fixture/store.jpg',address:'浦东新区花园石桥路158号上海中心大厦B1层7室',phone:'021-50181919',hours:'09:00–23:00',description:'2022年入驻上海中心大厦，在中国第一高楼里开一家中医养生馆。空间以「人在水间行走」为意象：水景、水墨屏风、原木理疗间，并配智能净烟艾灸设备。2026年完成扩店，28间理疗房。',gallery:[origin+'/fixture/room.jpg'],services:[care]}
const site={brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',tagline:'东方养护，自在有和。',hero:{image:origin+'/fixture/hero.jpg',eyebrow:'A MOMENT FOR YOURSELF',title:'留一段时光',subtitle:'好好照顾自己',button:'预约体验'},brandStory:'预约、项目和到店安排，都可以在这里咨询。',contact:{message:'每一次沟通，都认真对待'},stores:[store,{...store,id:'yuyao',name:'余姚路店',district:'静安区'}],services:[care],products:[{...care,id:'product-1',name:'草本茶饮'}],sections:[{id:'services',enabled:true},{id:'space',enabled:true},{id:'products',enabled:true},{id:'brand',enabled:true}],galleryGroups:[{id:'tea',name:'茶室光影',images:Array.from({length:10},(_,i)=>origin+`/fixture/tea-${i}.jpg`)}]}
const profile={name:'王女士',phone:'13900003001',phoneVerified:true,memberStatus:'MEMBER',memberGrade:'金卡',memberVerified:true,memberStoreId:'yuyao',memberStoreName:'余姚路店',crossStoreBookingSupported:true,sources:['MINIPROGRAM','DIANPING'],complete:true}
const nextDay=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})
const order={id:'YHT-I18N-FIXTURE',storeId:store.id,storeName:store.name,serviceName:care.name,bookingDate:nextDay,startTime:'15:00',headcount:1,status:'CONFIRMED',statusLabel:'门店已确认',version:1,customerActions:{canCancel:true,canReschedule:true,canWithdrawReschedule:false,deadline:new Date(Date.now()+86400000).toISOString(),serverTime:new Date().toISOString(),reason:''}}
order.membership={memberVerified:true,memberGrade:'金卡',memberStoreId:'yuyao',memberStoreName:'余姚路店',serviceStoreId:'shanghai',crossStore:true,status:'MEMBER',verificationMethod:'WECHAT_PHONE'}
const teachers=Array.from({length:9},(_,i)=>({id:`teacher-${i+1}`,storeId:store.id,name:`王老师${i+1}（示例）`,enabled:true,showOnClient:true,resting:false,serviceIds:[care.id],grade:'资深调理师'}))
const customerText='客户原话：明天想预约推拿。'
const conversation={id:'chat-i18n',status:'WAITING',storeId:store.id}

const construction={enabled:true,revision:1,updatedAt:'2026-11-10T13:00:00Z',
 title:{zh:'温馨提示',en:'A warm reminder',ja:'ご案内'},
 message:{zh:'裕和堂小程序正在建设中，功能尚未正式上线。目前仅供浏览，登录、预约、改约、取消、资料提交及客服对话暂不可用，不构成有效预约或业务办理。正式上线后，我们会通过官方渠道告知您。感谢您的理解与耐心等待。',en:'YU Health is under construction and has not officially launched. Browsing is available; sign-in, bookings, changes, cancellations, profile updates and chat are unavailable. No valid booking or business request can be made. We will announce the launch through our official channels. Thank you for your patience.',ja:'YU Healthのミニプログラムは現在準備中で、正式公開前です。閲覧のみ可能です。ログイン、予約・変更・キャンセル、情報の送信、チャットはご利用いただけず、有効な予約や手続きにはなりません。正式公開は公式のご案内でお知らせします。ご理解のほどお願いいたします。'}}

const contexts=[],checks=[],errors=[],unknown=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
async function fixture(lang,width=390,signedIn=true){
  const context=await browser.newContext({viewport:{width,height:width===320?640:844},isMobile:true,hasTouch:true});contexts.push(context)
  context.setDefaultTimeout(10000)
  const state={posts:[],calls:[],launch:structuredClone(construction)}
  await context.addInitScript(({lang,signedIn})=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    if(!localStorage.getItem('user-locale'))localStorage.setItem('user-locale',JSON.stringify({data:lang}))
    if(signedIn){
      localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
      localStorage.setItem('yht-token',JSON.stringify({data:'i18n-fixture'}))
      localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
    }
  },{lang,signedIn})
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(url.origin===api&&path.startsWith('/api/')){
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push(req.method()+' '+path)
      if(path==='/api/site')return json(site)
      if(path==='/api/launch-status')return json(state.launch)
      if(path==='/api/runtime')return json({customerProfiles:true,developmentLogin:false,customerTemplateIds:[]})
      if(path==='/api/me/profile')return json(profile)
      if(path==='/api/me/wallets')return json({accounts:[],entries:[],memberVerified:true,phoneVerified:true,migrationStatus:'PARTIAL',sourceSync:{enabled:false}})
      if(path==='/api/me/appointments')return json([order])
      if(path==='/api/me/appointments/YHT-I18N-FIXTURE/slots')return json({slots:[{time:'15:00',available:true,remaining:4}],rules:{advanceDays:7}})
      if(path==='/api/stores/shanghai/services')return json([care])
      if(path==='/api/stores/shanghai/therapists')return json(teachers)
      if(path==='/api/stores/shanghai/slots')return json({date:nextDay,storeId:store.id,slots:[{time:'15:00',available:true,remaining:4,capacity:4,used:0}],rules:{advanceDays:7,maxHeadcount:4}})
      if(path==='/api/appointments'&&req.method()==='POST'){state.posts.push(req.postDataJSON());return json(order)}
      if(path==='/api/me/chats'&&req.method()==='POST')return json(conversation)
      if(path==='/api/me/chats/chat-i18n/messages')return json({conversation,items:[{id:'message-1',seq:1,direction:'IN',kind:'text',content:customerText,createdAt:'2026-11-08T12:00:00+08:00'}]})
      unknown.push(req.method()+' '+path);return route.fulfill({status:404,headers,json:{message:'Unmocked request blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+path);return route.abort()}
    if(path.startsWith('/fixture/'))return route.fulfill({contentType:'image/jpeg',body:image})
    const filePath=resolve(dist,'.'+path);assert(filePath===dist||filePath.startsWith(dist+sep))
    const file=extname(filePath)?filePath:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {page,state,context}
}

const badges={zh:'建设中 · 仅供浏览',en:'Coming soon · Browse only',ja:'準備中・閲覧のみ'}
const ok={zh:'我知道了',en:'Got it',ja:'確認'}
async function notice(page,lang){
 const modal=page.locator('.taro-modal__content');await modal.waitFor({timeout:18000})
 assert((await modal.innerText()).includes(construction.message[lang]))
 const box=await modal.boundingBox(),vp=page.viewportSize()
 assert(box.x>=0&&box.y>=0&&box.x+box.width<=vp.width+1&&box.y+box.height<=vp.height+1,'Entire notice fits the screen')
 await page.screenshot({path:resolve(output,`notice-${lang}-${vp.width}.png`)})
 await modal.getByText(ok[lang],{exact:true}).click();await modal.waitFor({state:'hidden'})
}
try{
 for(const lang of ['zh','en','ja'])for(const width of [320,390,414]){
  const {page,state,context}=await fixture(lang,width,false)
  await page.goto(origin+'/#/pages/home/index');await notice(page,lang)
  const badge=page.locator('.launch-notice').filter({visible:true});await badge.waitFor()
  assert((await badge.innerText()).includes(badges[lang]));await assertFullText(page.locator('body'),'construction badge '+lang)
  const box=await badge.boundingBox();assert(box.x>=0&&box.x+box.width<=width+1)
  await page.screenshot({path:resolve(output,`badge-${lang}-${width}.png`)})
  await badge.click();await notice(page,lang)
  // One notice per revision/locale: moving to another tab keeps its persistent entry without a repeated modal.
  await page.locator('taro-tabbar').getByText(tr('门店',lang),{exact:true}).click()
  await page.locator('.stores-page').filter({visible:true}).waitFor()
  assert.equal(await page.locator('.taro-modal__content').isVisible(),false)
  // Direct routes are covered as well; login cannot prompt consent or call the native SDK.
  await page.goto('about:blank');await page.goto(origin+'/#/pages/login/index');await notice(page,lang)
  await page.locator('.login-hero-submit').click();await notice(page,lang)
  assert.equal(state.calls.filter(v=>/^(POST|PUT|PATCH|DELETE) /.test(v)).length,0)
  if(lang==='zh'&&width===390){
   const polls=()=>state.calls.filter(v=>v==='GET /api/launch-status').length
   const before=polls();state.launch={...construction,enabled:false,revision:2}
   await page.waitForFunction(()=>!document.querySelector('.launch-notice'),{},{timeout:18000})
   assert(polls()>before,'Visible page polls and applies a saved switch change')
   state.launch={...construction,revision:3}
   await notice(page,lang) // Wait for the next poll: no reload or rebuilt mini required.
   checks.push('Switch off/on is applied while the page is visible; notice returns on a new saved revision')
  }
  checks.push(`${lang} ${width}: notice and badge fit; re-open works; tab navigation is not repeatedly interrupted; login makes no business request`)
  await context.close()
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
 const report={status:'passed',createdAt:new Date().toISOString(),locales:['zh','en','ja'],widths:[320,390,414],liveApisUsed:false,realMessagesSent:false,checks,errors,unknown}
 await writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){for(const c of contexts)for(const p of c.pages())if(!p.isClosed())await p.screenshot({path:resolve(output,'failure.png'),fullPage:true}).catch(()=>{});console.error({errors,unknown});throw error}
finally{for(const c of contexts)await c.close().catch(()=>{});await browser.close()}
