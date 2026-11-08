import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,sep,extname} from 'node:path'

const origin='http://127.0.0.1:5182',apiOrigin='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/customer-profiles')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const contexts=[],checks=[],errors=[],unknown=[]
const store={id:'shanghai',name:'上海中心店',enabled:true,onlineBooking:true,image:'',address:'测试门店地址',hours:'09:00–23:00',phone:'021-50000000',gallery:[]}
const service={id:'care-1',name:'舒缓养护',enabled:true,storeId:store.id,image:'',subtitle:'让身心歇一歇',duration:'60分钟'}
const fresh={name:'',phone:'',phoneVerified:false,memberVerified:false,memberStatus:'NON_MEMBER',memberGrade:'',sources:['MINIPROGRAM'],complete:false,firstLoginAt:'2026-11-08T10:00:00+08:00',lastLoginAt:'2026-11-08T10:00:00+08:00'}
function withPolicy(item){
  if(item.omitPolicy)return item
  const deadline=item.deadlineOverride||new Date(Date.parse(`${item.bookingDate}T${item.startTime}:00+08:00`)-7200000).toISOString()
  const active=['PENDING','CONFIRMED'].includes(item.status),before=active&&Date.now()<Date.parse(deadline)
  const pending=item.rescheduleRequest?.status==='PENDING'&&Date.now()<Date.parse(item.rescheduleRequest.expiresAt)
  return {...item,customerActions:{canCancel:before,canReschedule:before&&!pending,canWithdrawReschedule:active&&pending,deadline,serverTime:new Date().toISOString(),reason:before?'':'已超过自助处理截止时间，取消或改约请联系门店。'}}
}
async function fixture(profile={...fresh},orders=[],width=390){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true});contexts.push(context)
  const state={profile:{...profile},orders:orders.map(item=>({...item})),calls:[],saves:[],changes:[]}
  await context.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    localStorage.setItem('yht-token',JSON.stringify({data:'customer-profile-fixture'}))
    localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
  })
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===apiOrigin&&url.pathname.startsWith('/api/')){
      const path=url.pathname,headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push({path,method:req.method()})
      if(path==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU HE TANG',theme:'sage',hero:{},contact:{},stores:[store],services:[],sections:[],products:[],galleryGroups:[]})
      if(path==='/api/runtime')return json({customerProfiles:true,developmentLogin:false,customerTemplateId:'result-fixture',customerReminderTemplateId:'reminder-fixture',customerTemplateIds:['result-fixture','reminder-fixture']})
      if(path.startsWith('/api/me/'))assert.equal(req.headers().authorization,'Bearer customer-profile-fixture')
      if(path==='/api/me/profile'&&req.method()==='GET')return json(state.profile)
      if(path==='/api/me/profile'&&req.method()==='PUT'){
        const body=req.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['consent','name']);assert.equal(body.consent,true)
        state.saves.push(body);state.profile={...state.profile,name:body.name};return json(state.profile)
      }
      if(path==='/api/me/appointments')return json(state.orders.map(withPolicy))
      if(path==='/api/me/appointments/order-fixture/slots')return json({slots:[{time:'16:00',available:true,remaining:4}],rules:{advanceDays:7}})
      if(path==='/api/me/appointments/order-fixture'&&req.method()==='PATCH'){
        const change=req.postDataJSON();state.changes.push(change)
        const item=state.orders.find(item=>item.id==='order-fixture');assert(item);assert.equal(change.version,item.version)
        if(change.action==='reschedule')Object.assign(item,{version:item.version+1,rescheduleRequest:{id:'change-fixture',status:'PENDING',statusLabel:'改约待门店处理',originalDate:item.bookingDate,originalTime:item.startTime,requestedDate:change.date,requestedTime:change.startTime,requestedHeadcount:item.headcount,expiresAt:new Date(Date.now()+3600000).toISOString()}})
        else if(change.action==='withdraw_reschedule')Object.assign(item,{version:item.version+1,rescheduleRequest:{...item.rescheduleRequest,status:'WITHDRAWN',statusLabel:'改约已撤回',resolutionNote:'客户撤回，原预约保留。'}})
        else {assert.equal(change.action,'cancel');Object.assign(item,{status:'CANCELLED',statusLabel:'已取消',version:item.version+1})}
        return json(withPolicy(item))
      }
      if(path==='/api/stores/shanghai/services')return json([service])
      if(path==='/api/stores/shanghai/therapists')return json([])
      if(path==='/api/stores/shanghai/slots')return json({date:url.searchParams.get('date'),storeId:store.id,slots:[{time:'15:00',capacity:4,used:0,remaining:4,available:true}],rules:{advanceDays:7,maxHeadcount:4}})
      unknown.push(req.method()+' '+path);return route.fulfill({status:404,headers,json:{message:'Unmocked API blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+url.pathname);return route.abort()}
    const path=resolve(dist,'.'+url.pathname);assert(path===dist||path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {page,state}
}
async function visit(page,path){await page.goto('about:blank');await page.goto(origin+'/#'+path);await page.locator('.customer-profile-card').waitFor()}
async function noManualSubscription(page,state){
  assert.equal(await page.locator('.subscription-preferences, .booking-subscriptions').count(),0)
  for(const title of ['订阅预约及到店提醒','微信订阅设置','预约消息提醒'])assert.equal(await page.getByText(title,{exact:true}).count(),0)
  assert.equal(state.calls.filter(call=>call.path==='/api/me/subscriptions').length,0,'Browsing or modifying appointments never uses a manual subscription balance/enable API in H5')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Orders fit the mobile viewport')
}
try{
  const pending=await fixture();await visit(pending.page,'/pages/orders/index')
  await pending.page.getByText('还没有预约',{exact:true}).waitFor()
  await noManualSubscription(pending.page,pending.state)
  await pending.page.screenshot({path:resolve(output,'orders-without-manual-subscription.png')})
  checks.push('My Appointments has no separate subscription card, button or balance query')
  const card=pending.page.locator('.customer-profile-card'),input=card.locator('input[placeholder="请输入您的姓名或称呼"]')
  await input.waitFor();assert.equal(await card.locator('input[type=checkbox]').isChecked(),false)
  await card.getByText('保存称呼',{exact:true}).click()
  await card.getByText('请填写您的姓名或称呼。',{exact:true}).waitFor()
  await input.fill('王女士');await card.getByText('保存称呼',{exact:true}).click()
  await card.getByText('请先同意将资料用于客户档案与预约联系。',{exact:true}).waitFor()
  assert.equal(pending.state.saves.length,0)
  await card.locator('.profile-consent').click()
  await pending.page.screenshot({path:resolve(output,'profile-completion-390.png'),fullPage:true})
  const saved=pending.page.waitForResponse(response=>response.url()===apiOrigin+'/api/me/profile'&&response.request().method()==='PUT')
  await card.getByText('保存称呼',{exact:true}).click()
  await saved
  assert.equal(pending.state.saves.length,1);assert.equal(pending.state.profile.name,'王女士')
  assert.equal(pending.state.profile.phone,'');assert.equal(pending.state.profile.phoneVerified,false)
  assert.equal(pending.state.calls.some(call=>call.path.endsWith('/phone')),false)
  checks.push('Name/consent are required before saving; production H5 never invents a phone authorization')
  await visit(pending.page,'/pages/profile/index')
  assert.equal(await pending.page.locator('input[placeholder="请输入您的姓名或称呼"]').inputValue(),'王女士')
  checks.push('Saved name is reloaded from the authenticated profile API on a new visit')
  const member=await fixture({...fresh,name:'陈女士',phone:'13900003001',phoneVerified:true,memberVerified:true,memberStatus:'MEMBER',memberGrade:'金卡',complete:true,sources:['MINIPROGRAM','DIANPING']})
  await visit(member.page,'/pages/profile/index')
  await member.page.getByText('13900003001 · 微信手机号已授权',{exact:true}).waitFor()
  assert.equal(await member.page.locator('.profile-card-form').count(),0)
  await member.page.getByText('金卡',{exact:true}).waitFor()
  await member.page.screenshot({path:resolve(output,'profile-member-390.png')})
  await member.page.getByText('编辑个人资料',{exact:false}).click()
  assert.equal(await member.page.locator('.profile-consent input[type=checkbox]').isChecked(),false)
  await member.page.locator('.profile-field input').fill('陈先生')
  await member.page.locator('.profile-consent').click()
  await member.page.getByText('保存称呼',{exact:true}).click()
  await member.page.locator('.profile-card-form').waitFor({state:'detached'})
  await member.page.getByText('陈先生',{exact:true}).waitFor()
  assert.equal(member.state.profile.memberVerified,true);assert.equal(member.state.profile.phone,'13900003001')
  assert(await member.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1))
  checks.push('Verified phone and membership remain intact after name edits; the 390px layout has no page overflow')
  await member.page.goto('about:blank');await member.page.goto(origin+'/#/pages/booking/index?storeId=shanghai&serviceId=care-1')
  await member.page.getByText('下一步 →',{exact:true}).click()
  await member.page.getByText('舒缓养护',{exact:true}).waitFor()
  await member.page.getByText('下一步 →',{exact:true}).click()
  await member.page.locator('.slot-grid').getByText('15:00',{exact:false}).click()
  await member.page.getByText('下一步 →',{exact:true}).click()
  assert.equal(await member.page.locator('input[placeholder="请输入称呼"]').inputValue(),'陈先生')
  assert.equal(await member.page.locator('input[placeholder="便于门店确认预约"]').inputValue(),'13900003001')
  checks.push('Booking confirmation prefills the authenticated name and verified phone without submitting an appointment')
  for(const width of [320,390,414]){
    const nextDay=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})
    const order={id:'order-fixture',storeName:store.name,serviceName:service.name,bookingDate:nextDay,startTime:'15:00',headcount:1,status:'CONFIRMED',statusLabel:'门店已确认',version:1}
    const active=await fixture({...fresh,name:'测试客户',complete:true},[order],width)
    await visit(active.page,'/pages/orders/index')
    await active.page.getByText('门店已确认',{exact:true}).waitFor()
    await noManualSubscription(active.page,active.state)
    await active.page.screenshot({path:resolve(output,`orders-without-manual-subscription-${width}.png`),fullPage:true})
    await active.page.getByText('申请改约',{exact:true}).click()
    await active.page.locator('.edit-panel .picker').filter({hasText:'16:00'}).waitFor()
    await noManualSubscription(active.page,active.state)
    await active.page.getByText('暂不改约',{exact:true}).click()
    assert.equal(active.state.changes.length,0,'Opening/dismissing reschedule never submits an appointment or subscription')
    await active.page.getByText('申请改约',{exact:true}).click()
    await active.page.locator('.edit-panel .picker').filter({hasText:'16:00'}).waitFor()
    await active.page.getByText('提交改约',{exact:true}).click()
    await active.page.getByText('改约申请已提交',{exact:true}).waitFor()
    await active.page.locator('.taro-model__confirm').click()
    await active.page.locator('.order .appointment-time').filter({hasText:'15:00'}).waitFor()
    await active.page.locator('.reschedule-summary').filter({hasText:'16:00'}).waitFor()
    assert.equal(await active.page.getByText('申请改约',{exact:true}).count(),0,'Pending request cannot be duplicated')
    assert.equal(active.state.changes.length,1);assert.equal(active.state.changes[0].action,'reschedule')
    await active.page.screenshot({path:resolve(output,`orders-reschedule-pending-${width}.png`),fullPage:true})
    await active.page.getByText('撤回改约申请',{exact:true}).click()
    await active.page.getByText('撤回申请',{exact:true}).click()
    await active.page.getByText('改约已撤回',{exact:true}).waitFor()
    assert.equal(active.state.changes[1].action,'withdraw_reschedule');assert.equal(active.state.orders[0].startTime,'15:00')
    await active.page.getByText('取消预约',{exact:true}).click()
    await active.page.getByText('确定取消',{exact:true}).click()
    await active.page.getByText('已取消',{exact:true}).waitFor()
    assert.equal(active.state.changes.length,3);assert.equal(active.state.changes[2].action,'cancel')
    await noManualSubscription(active.page,active.state)
    await visit(active.page,'/pages/orders/index')
    await active.page.getByText('已取消',{exact:true}).waitFor()
    await noManualSubscription(active.page,active.state)
    checks.push(`${width}px: request preserves original appointment, duplicate request is hidden, withdrawal keeps original, cancellation is versioned and no manual subscription controls appear`)
  }
  const tomorrow=new Date(Date.now()+86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})
  const expiring=await fixture({...fresh,name:'截止测试',complete:true},[{id:'order-fixture',storeName:store.name,serviceName:service.name,bookingDate:tomorrow,startTime:'15:00',headcount:1,status:'CONFIRMED',statusLabel:'门店已确认',version:1,deadlineOverride:new Date(Date.now()+5000).toISOString()}])
  await visit(expiring.page,'/pages/orders/index')
  await expiring.page.getByText('取消预约',{exact:true}).waitFor()
  await expiring.page.getByText('取消预约',{exact:true}).waitFor({state:'detached',timeout:8000})
  assert.equal(await expiring.page.getByText('申请改约',{exact:true}).count(),0)
  await expiring.page.getByText('已超过自助处理截止时间，取消或改约请联系门店。',{exact:true}).waitFor()
  await expiring.page.screenshot({path:resolve(output,'orders-cutoff-390.png'),fullPage:true})
  assert.equal(expiring.state.changes.length,0)
  checks.push('Visible page closes customer actions automatically at the server cutoff without a page refresh')
  const legacy=await fixture({...fresh,name:'旧接口测试',complete:true},[{id:'order-fixture',storeName:store.name,serviceName:service.name,bookingDate:tomorrow,startTime:'15:00',headcount:1,status:'CONFIRMED',statusLabel:'门店已确认',version:1,omitPolicy:true}])
  await visit(legacy.page,'/pages/orders/index');await legacy.page.getByText('门店已确认',{exact:true}).waitFor()
  assert.equal(await legacy.page.getByText('取消预约',{exact:true}).count(),0);assert.equal(await legacy.page.getByText('申请改约',{exact:true}).count(),0)
  checks.push('An older API response without action policy cannot expose unrestricted cancellation or rescheduling')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',liveApisUsed:false,checks,errors,unknown,nativePhoneAuthorization:'requires real WeChat device; provider exchange is covered by Java tests'},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
}finally{for(const context of contexts)await context.close();await browser.close()}
