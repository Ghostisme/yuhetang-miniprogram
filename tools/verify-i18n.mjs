import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve, sep, extname} from 'node:path'

// Real compiled UI; every HTTP request is fulfilled locally or blocked.
const origin='http://127.0.0.1:5182',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/i18n')
await mkdir(output,{recursive:true})
const dictionary={...JSON.parse(await readFile('src/i18n/content.json','utf8')),...JSON.parse(await readFile('src/i18n/messages.json','utf8'))}
const tr=(text,lang)=>lang==='zh'?text:dictionary[text]?.[lang]||text
const labels={zh:'中文',en:'English',ja:'日本語'}
const image=await readFile('src/assets/login/reception.jpg')
const care={id:'care-1',name:'中医推拿',category:'特色养护',enabled:true,image:origin+'/fixture/care.jpg',subtitle:'循着身体的节奏，找到自己的放松方式。',description:'预约、项目和到店安排，都可以在这里咨询。',duration:'60分钟',steps:['中医推拿','预约体验']}
const store={id:'shanghai',name:'上海中心店',district:'浦东新区',enabled:true,onlineBooking:true,image:origin+'/fixture/store.jpg',address:'浦东新区花园石桥路158号上海中心大厦B1层7室',phone:'021-50181919',hours:'09:00–23:00',description:'2022年入驻上海中心大厦，在中国第一高楼里开一家中医养生馆。空间以「人在水间行走」为意象：水景、水墨屏风、原木理疗间，并配智能净烟艾灸设备。2026年完成扩店，28间理疗房。',gallery:[origin+'/fixture/room.jpg'],services:[care]}
const site={brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',tagline:'东方养护，自在有和。',hero:{image:origin+'/fixture/hero.jpg',eyebrow:'A MOMENT FOR YOURSELF',title:'留一段时光',subtitle:'好好照顾自己',button:'预约体验'},brandStory:'预约、项目和到店安排，都可以在这里咨询。',contact:{message:'每一次沟通，都认真对待'},stores:[store,{...store,id:'yuyao',name:'余姚路店',district:'静安区'}],services:[care],products:[{...care,id:'product-1',name:'草本茶饮'}],sections:[{id:'services',enabled:true},{id:'space',enabled:true},{id:'products',enabled:true},{id:'brand',enabled:true}],galleryGroups:[{id:'tea',name:'茶室光影',images:Array.from({length:10},(_,i)=>origin+`/fixture/tea-${i}.jpg`)}]}
const profile={name:'王女士',phone:'13900003001',phoneVerified:true,memberStatus:'MEMBER',memberGrade:'金卡',memberVerified:true,sources:['MINIPROGRAM','DIANPING'],complete:true}
const nextDay=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})
const order={id:'YHT-I18N-FIXTURE',storeId:store.id,storeName:store.name,serviceName:care.name,bookingDate:nextDay,startTime:'15:00',headcount:1,status:'CONFIRMED',statusLabel:'门店已确认',version:1,customerActions:{canCancel:true,canReschedule:true,canWithdrawReschedule:false,deadline:new Date(Date.now()+86400000).toISOString(),serverTime:new Date().toISOString(),reason:''}}
const customerText='客户原话：明天想预约推拿。'
const conversation={id:'chat-i18n',status:'WAITING',storeId:store.id}
const contexts=[],checks=[],errors=[],unknown=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
async function fixture(lang,width=390,signedIn=true){
  const context=await browser.newContext({viewport:{width,height:width===320?640:844},isMobile:true,hasTouch:true});contexts.push(context)
  context.setDefaultTimeout(10000)
  const state={posts:[],calls:[]}
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
      if(path==='/api/runtime')return json({customerProfiles:true,developmentLogin:false,customerTemplateIds:[]})
      if(path==='/api/me/profile')return json(profile)
      if(path==='/api/me/appointments')return json([order])
      if(path==='/api/stores/shanghai/services')return json([care])
      if(path==='/api/stores/shanghai/therapists')return json([{id:'teacher-1',storeId:store.id,name:'王老师（示例）',enabled:true,showOnClient:true,resting:false,serviceIds:[care.id],grade:'资深调理师'}])
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
function active(page,css='.page'){return page.locator(css).filter({visible:true}).last()}
async function visit(page,path,css){await page.goto('about:blank');await page.goto(origin+'/#/pages/'+path);await active(page,css).waitFor()}
async function fit(page,label){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' fits viewport')}
async function language(page,lang){
  await active(page).locator('.language-button').click()
  await page.getByText(labels[lang],{exact:true}).filter({visible:true}).last().click()
  await page.locator(`.page.locale-${lang}`).filter({visible:true}).waitFor()
  await page.getByText(labels[lang==='zh'?'ja':'zh'],{exact:true}).filter({visible:true}).waitFor({state:'hidden'})
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('user-locale')).data),lang)
}
try{
  for(const lang of ['zh','en','ja'])for(const width of [320,390,414]){
    const {page,state,context}=await fixture(lang,width)
    await visit(page,'home/index','.home-page')
    await active(page).locator('.hero-button').waitFor()
    assert.equal(await active(page).locator('.quick-label').first().innerText(),tr('特色养护',lang))
    assert.equal(await page.locator('taro-tabbar').getByText(tr('门店',lang),{exact:true}).count(),1)
    await fit(page,`${lang} home ${width}`)
    await page.screenshot({path:resolve(output,`home-${lang}-${width}.png`)})
    await visit(page,'stores/index','.stores-page')
    await active(page).locator('.store-card').first().waitFor()
    await active(page).locator('.toolbar').getByText(tr('浦东新区',lang),{exact:true}).click()
    assert.equal(await active(page).locator('.store-card').count(),1)
    await language(page,lang==='en'?'ja':'en')
    assert.equal(await active(page).locator('.store-card').count(),1,'Region filter survives language switching')
    await language(page,lang)
    await fit(page,`${lang} stores ${width}`)
    await visit(page,'store-detail/index?storeId=shanghai','.store-detail-page')
    await active(page).locator('.store-service-card').waitFor()
    assert.equal(await active(page).locator('.article > .heading').innerText(),tr(store.name,lang))
    await fit(page,`${lang} store detail ${width}`)
    await visit(page,'catalog/index','.catalog-page')
    await active(page).getByText(tr('空间美学',lang),{exact:true}).click()
    const target=active(page).locator('.gallery taro-image-core').nth(7)
    await target.scrollIntoViewIfNeeded();const box=await target.boundingBox()
    await target.click();await page.locator('.preview-image').waitFor()
    await page.locator('.preview-image').click({position:{x:8,y:8}})
    await page.locator('.preview-image').waitFor({state:'detached'})
    assert.equal(await active(page).locator('.catalog-tabs .active').innerText(),tr('空间美学',lang))
    assert(Math.abs((await target.boundingBox()).y-box.y)<2,'Preview returns to the same image')
    await active(page).locator('.language-button').scrollIntoViewIfNeeded()
    await language(page,lang==='en'?'ja':'en');assert.equal(await active(page).locator('.gallery taro-image-core').count(),10)
    await language(page,lang)
    await fit(page,`${lang} gallery ${width}`)
    await visit(page,'contact/index','.contact-page');await active(page).locator('.contact-store-picker').waitFor();await fit(page,`${lang} contact ${width}`)
    await visit(page,'booking/index?storeId=shanghai&serviceId=care-1','.booking-page')
    for(let step=0;step<3;step++){
      await fit(page,`${lang} booking step ${step+1} ${width}`)
      if(step===2)await active(page).locator('.slot-grid').getByText('15:00',{exact:false}).click()
      await page.screenshot({path:resolve(output,`booking-${lang}-${width}-step${step+1}.png`)})
      await active(page).getByText(tr('下一步 →',lang),{exact:true}).click()
    }
    const form=active(page)
    await form.locator('input').first().fill('李女士')
    await form.locator('input').nth(1).fill('13900003009')
    await form.locator('textarea').fill('客户原始备注 unchanged')
    const requestCount=state.calls.filter(x=>x.includes('/api/stores/')).length
    for(const selected of ['en','ja','zh',lang]){
      await language(page,selected)
      assert.equal(await form.locator('input').first().inputValue(),'李女士')
      assert.equal(await form.locator('input').nth(1).inputValue(),'13900003009')
      assert.equal(await form.locator('textarea').inputValue(),'客户原始备注 unchanged')
      assert.equal(await form.locator('.steps .active').innerText(),`4\n${tr('预约信息',selected)}`)
      await fit(page,`${selected} booking form ${width}`)
    }
    assert.equal(state.calls.filter(x=>x.includes('/api/stores/')).length,requestCount,'Switching language does not reload or reset booking choices')
    await page.screenshot({path:resolve(output,`booking-${lang}-${width}-step4.png`)})
    const footer=await form.locator('.booking-footer').boundingBox(),scroll=await form.locator('.booking-content').boundingBox()
    assert(footer.y+footer.height<=page.viewportSize().height+1&&scroll.height>100,'Booking footer stays visible with a scrolling middle section')
    await form.locator('input[type=checkbox]').first().check()
    await form.locator('.booking-footer .primary').click()
    await form.locator('.receipt').waitFor()
    assert.equal(state.posts.length,1)
    assert.deepEqual({storeId:state.posts[0].storeId,serviceId:state.posts[0].serviceId,name:state.posts[0].name,remark:state.posts[0].remark,phone:state.posts[0].phone},{storeId:'shanghai',serviceId:'care-1',name:'李女士',remark:'客户原始备注 unchanged',phone:'13900003009'})
    await visit(page,'orders/index','.orders-page');await active(page).getByText(tr('门店已确认',lang),{exact:true}).waitFor()
    assert.equal(await active(page).locator('.subscription-preferences, .booking-subscriptions').count(),0)
    await fit(page,`${lang} orders ${width}`)
    if(width===390)await page.screenshot({path:resolve(output,`orders-${lang}.png`),fullPage:true})
    await visit(page,'profile/index','.profile-page');await active(page).getByText('王女士',{exact:true}).waitFor();await active(page).getByText(tr('金卡',lang),{exact:true}).waitFor();await fit(page,`${lang} profile ${width}`)
    await visit(page,'chat/index?storeId=shanghai','.chat-page');await active(page).getByText(customerText,{exact:true}).waitFor()
    await active(page).locator('textarea').fill('草稿保持原文')
    await language(page,lang==='en'?'ja':'en')
    assert.equal(await active(page).locator('textarea').inputValue(),'草稿保持原文')
    assert.equal(await active(page).getByText(customerText,{exact:true}).count(),1)
    await fit(page,`${lang} chat ${width}`)
    await language(page,lang)
    if(width===390)await page.screenshot({path:resolve(output,`chat-${lang}.png`)})
    for(const kind of ['terms','privacy']){
      await visit(page,'legal/index?kind='+kind,'.legal-page')
      if(lang==='en')assert(!/[\u4e00-\u9fff]/.test(await active(page).locator('.section').innerText()),'English legal paragraphs are translated')
      await fit(page,`${lang} legal ${kind} ${width}`)
    }
    checks.push(`${lang}/${width}px: all content/booking/order/profile/chat/legal screens fit; region and gallery selection, customer text and booking choices survive language switches; booking submits canonical business data`)
    await context.close()
  }
  for(const lang of ['zh','en','ja']){
    const {page,context}=await fixture(lang,390,false)
    await visit(page,'login/index','.login-page');await active(page).locator('.login-hero-submit').waitFor();await fit(page,lang+' guest login')
    await page.screenshot({path:resolve(output,`login-${lang}.png`)})
    await active(page).locator('.login-hero-submit').click()
    await active(page).getByText(tr('请先阅读并同意用户协议与隐私说明。',lang),{exact:true}).waitFor()
    assert.equal(await page.locator('.login-sheet').count(),0,'Hero login does not open another sheet')
    await language(page,lang==='en'?'ja':'en')
    await page.reload();await active(page).waitFor()
    assert.equal(await active(page).locator('.language-button').innerText(),`◎\n${labels[lang==='en'?'ja':'en']}\n⌄`)
    checks.push(`${lang}: photo login translates without a second dialog, requires consent, and remembers the chosen language after reload`)
    await context.close()
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  const report={status:'passed',createdAt:new Date().toISOString(),locales:['zh','en','ja'],widths:[320,390,414],liveApisUsed:false,realMessagesSent:false,checks,errors,unknown}
  await writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}catch(error){
  for(const [i,context]of contexts.entries())for(const page of context.pages())if(!page.isClosed())await page.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true}).catch(()=>{})
  console.error({errors,unknown});throw error
}finally{for(const context of contexts)await context.close().catch(()=>{});await browser.close()}
