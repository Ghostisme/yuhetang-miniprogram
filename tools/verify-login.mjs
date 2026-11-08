import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'

// Run built H5 bundles against isolated fixtures. Only an explicitly enabled
// development build can exchange a fixture identity. Native wx.login is
// exercised separately by auth-api.test.ts; production H5 must never fake it.
const origin='http://127.0.0.1:5182', apiOrigin='https://mp-admin.hetuonian.cn'
const developmentFixture=process.argv.includes('--development-fixture')
const dist=resolve(developmentFixture?'backups/login-fixture-h5':'dist/h5')
const output=resolve(developmentFixture?'backups/login-development-verification':'backups/login-verification')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const checks=[],errors=[],unknown=[],calls=[]
const store={id:'shanghai',name:'上海中心店',enabled:true,onlineBooking:true,image:'',address:'测试门店地址',hours:'09:00–23:00',phone:'021-50000000',gallery:[]}
const service={id:'care-1',name:'舒缓养护',enabled:true,storeId:'shanghai',image:'',subtitle:'让身心歇一歇',duration:'60分钟'}
const site={brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',hero:{},contact:{phone:'021-50000000'},stores:[store],services:[],sections:[],products:[],galleryGroups:[]}
const runtime={developmentLogin:developmentFixture,customerTemplateIds:[]}
const appointment={id:'fixture-appointment',storeId:store.id,storeName:store.name,serviceId:service.id,serviceName:service.name,bookingDate:'2026-12-01',startTime:'15:00',headcount:1,status:'PENDING',statusLabel:'待门店确认',version:1}
const settled = page => page.waitForTimeout(400) // Wait only for the H5 router animation, not for API readiness.
async function visit(page,path) { await page.goto('about:blank'); await page.goto(origin+'/#'+path); await settled(page) }
async function buildFiles(folder=dist,prefix='') {
  const hashes={}
  for(const item of await readdir(folder,{withFileTypes:true})) {
    if(item.isDirectory())Object.assign(hashes,await buildFiles(resolve(folder,item.name),prefix+item.name+'/'))
    else hashes[prefix+item.name]=createHash('sha256').update(await readFile(resolve(folder,item.name))).digest('hex')
  }
  return hashes
}
async function setup({signedIn=false,expired=false,width=390,height=844,delayAuth=false}={}) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true})
  let releaseAuth
  const authGate=delayAuth?new Promise(resolve=>{releaseAuth=resolve}):Promise.resolve()
  await context.addInitScript(({signedIn,developmentFixture})=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    // A one-shot development build retains Babel's refresh registration but has
    // no hot-reload server. Registration is irrelevant to the behavior under test.
    if(developmentFixture) {window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type}
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|'+(developmentFixture?'development':'wechat')}))
    if(signedIn) {
      localStorage.setItem('yht-token',JSON.stringify({data:'fixture-customer-token'}))
      localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
    }
  },{signedIn,developmentFixture})
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===apiOrigin && url.pathname.startsWith('/api/')) {
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
      const json=(data,status=200)=>route.fulfill({status,headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      calls.push({path:url.pathname,method:req.method(),authorization:req.headers().authorization})
      if(url.pathname==='/api/site')return json(site)
      if(url.pathname==='/api/runtime')return json(runtime)
      if(url.pathname==='/api/auth/dev-customer'&&developmentFixture) {
        assert.equal(req.method(),'POST');assert(req.postDataJSON().deviceId)
        await authGate
        return json({token:'fixture-customer-token'})
      }
      if(url.pathname==='/api/stores/shanghai/services')return json([service])
      if(url.pathname==='/api/stores/shanghai/therapists')return json([])
      if(url.pathname==='/api/stores/shanghai/slots')return json({date:url.searchParams.get('date'),storeId:'shanghai',slots:[{time:'15:00',capacity:4,used:0,remaining:4,available:true}],rules:{advanceDays:7,maxHeadcount:4}})
      if(url.pathname.startsWith('/api/me/')) {
        assert.equal(req.headers().authorization,'Bearer fixture-customer-token')
        if(expired)return json({message:'登录已失效'},401)
        if(url.pathname==='/api/me/appointments')return json([appointment])
        if(url.pathname==='/api/me/subscriptions')return json({templates:[],items:[],development:false})
        if(url.pathname==='/api/me/chats'&&req.method()==='POST')return json({id:'fixture-chat',status:'OPEN'})
        if(url.pathname==='/api/me/chats/fixture-chat/messages')return json({conversation:{id:'fixture-chat',status:'OPEN'},items:[]})
      }
      unknown.push(req.method()+' '+url.pathname);return json({message:'Unmocked request blocked'},404)
    }
    if(url.origin!==origin) {unknown.push(req.url());return route.abort()}
    const path=resolve(dist,'.'+url.pathname)
    assert(path===dist || path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {context,page,releaseAuth}
}
const contexts=[]
async function verifyDevelopment() {
  const hero=await setup();contexts.push(hero.context)
  await visit(hero.page,'/pages/orders/index')
  await hero.page.locator('.login-consent-toggle').click()
  await hero.page.locator('.login-hero-submit').click()
  await hero.page.getByText('舒缓养护',{exact:true}).waitFor()
  assert.equal(await hero.page.locator('.customer-login-overlay').count(),0)
  assert.equal(new URL(hero.page.url()).hash,'#/pages/orders/index')
  checks.push('Explicit photo-page login loads personal appointments in place with no intermediate sheet')

  const booking=await setup();contexts.push(booking.context)
  await visit(booking.page,'/pages/booking/index?storeId=shanghai&serviceId=care-1')
  await booking.page.getByText('下一步 →',{exact:true}).click()
  await booking.page.getByText('舒缓养护',{exact:true}).waitFor()
  await booking.page.getByText('下一步 →',{exact:true}).click()
  await booking.page.locator('.slot-grid').getByText('15:00',{exact:false}).click()
  await booking.page.getByText('下一步 →',{exact:true}).click()
  await booking.page.locator('input[placeholder="请输入称呼"]').fill('测试客户')
  await booking.page.locator('input[placeholder="便于门店确认预约"]').fill('13800000000')
  await booking.page.locator('textarea[placeholder="请勿填写身份证、病历等不必要信息"]').fill('希望安静一些')
  await booking.page.getByText('微信登录后提交',{exact:true}).click()
  await settled(booking.page)
  await booking.page.locator('.login-consent-toggle').click()
  await booking.page.locator('.login-submit').click()
  await booking.page.locator('.login-sheet-dialog').waitFor({state:'detached'})
  await booking.page.getByText('提交预约申请',{exact:true}).waitFor()
  assert.equal(await booking.page.locator('input[placeholder="请输入称呼"]').inputValue(),'测试客户')
  assert.equal(await booking.page.locator('input[placeholder="便于门店确认预约"]').inputValue(),'13800000000')
  assert.equal(await booking.page.locator('textarea[placeholder="请勿填写身份证、病历等不必要信息"]').inputValue(),'希望安静一些')
  assert.equal(new URL(booking.page.url()).hash,'#/pages/booking/index?storeId=shanghai&serviceId=care-1')
  assert.equal(calls.filter(c=>c.path==='/api/appointments').length,0)
  checks.push('Successful sheet login preserves booking draft and selection; no booking is submitted automatically')

  const chat=await setup();contexts.push(chat.context)
  await visit(chat.page,'/pages/chat/index?storeId=shanghai')
  const before=calls.filter(c=>c.path==='/api/me/chats').length
  await chat.page.getByText('微信登录，开始咨询',{exact:true}).click()
  await settled(chat.page)
  await chat.page.locator('.login-consent-toggle').click()
  await chat.page.locator('.login-submit').click()
  await chat.page.locator('.login-sheet-dialog').waitFor({state:'detached'})
  await chat.page.getByText('等待门店接入，您可以先留下问题。',{exact:true}).waitFor()
  await chat.page.locator('.chat-compose textarea').waitFor()
  assert.equal(calls.filter(c=>c.path==='/api/me/chats').length-before,1)
  checks.push('Successful consultation login dismisses the sheet and creates exactly one consultation for the selected store')

  for(const mode of ['sheet','hero']) {
    const delayed=await setup({delayAuth:true});contexts.push(delayed.context)
    await visit(delayed.page,mode==='sheet'?'/pages/chat/index?storeId=shanghai':'/pages/orders/index')
    if(mode==='sheet') {await delayed.page.getByText('微信登录，开始咨询',{exact:true}).click();await settled(delayed.page)}
    await delayed.page.locator('.login-consent-toggle').click()
    const started=delayed.page.waitForRequest(req=>req.url()===apiOrigin+'/api/auth/dev-customer')
    await delayed.page.locator(mode==='sheet'?'.login-submit':'.login-hero-submit').click()
    await started
    if(mode==='sheet')await delayed.page.locator('.login-sheet-close').click()
    else {
      await delayed.page.locator('taro-tabbar').getByText('门店',{exact:true}).click()
      await delayed.page.getByText('寻一处安放心绪的地方',{exact:true}).waitFor()
      await settled(delayed.page) // didHide occurs when the tab transition completes.
    }
    const returned=delayed.page.waitForResponse(res=>res.url()===apiOrigin+'/api/auth/dev-customer')
    delayed.releaseAuth()
    await returned;await settled(delayed.page)
    assert.equal(await delayed.page.evaluate(()=>localStorage.getItem('yht-token')),null)
    assert.equal(await delayed.page.locator('.customer-login-overlay').count(),0)
    checks.push(mode==='sheet'?'Closing a pending login sheet discards its late identity response':'Leaving the photo login page discards its late identity response')
  }
}
try {
  if(developmentFixture) await verifyDevelopment()
  else {
  const guest=await setup();contexts.push(guest.context)
  const page=guest.page
  await visit(page,'/pages/orders/index')
  await page.locator('.login-hero-submit').waitFor()
  await page.locator('.login-hero-image img').evaluate(img=>img.decode())
  assert.equal(await page.locator('.customer-login-overlay').count(),0)
  assert.equal(calls.filter(c=>c.path.startsWith('/api/me/') || c.path.startsWith('/api/auth/')).length,0)
  const heroConsent=page.locator('.on-photo input[type=checkbox]')
  assert.equal(await heroConsent.isChecked(),false)
  await page.screenshot({path:resolve(output,'login-390.png')})
  checks.push('Guest appointment page displays the full photo with local imagery and no silent authentication or personal requests')

  await page.locator('.login-hero-submit').click()
  await page.getByText('请先阅读并同意用户协议与隐私说明。',{exact:true}).waitFor()
  assert.equal(await page.locator('.customer-login-overlay').count(),0)
  assert.equal(page.url(),origin+'/#/pages/orders/index')
  await page.getByText('《隐私说明》',{exact:true}).click()
  await page.getByText('登录身份',{exact:true}).waitFor()
  await settled(page)
  await page.getByText('返回',{exact:true}).click()
  await settled(page)
  assert.equal(await heroConsent.isChecked(),false)
  checks.push('Photo-page login uses inline consent validation; reading legal text does not grant consent or open a login popup')

  await page.locator('.login-consent-toggle').click()
  assert.equal(await heroConsent.isChecked(),true)
  await page.locator('.login-hero-submit').click()
  await page.getByText('请在微信小程序内登录后办理预约；H5 可浏览门店与项目。',{exact:true}).waitFor()
  assert.equal(await page.locator('.customer-login-overlay').count(),0)
  assert.equal(calls.filter(c=>c.path.startsWith('/api/auth/')).length,0)
  checks.push('Photo-page button invokes authorization directly; production H5 explains its platform limit without faking an identity')

  await visit(page,'/pages/chat/index?storeId=shanghai')
  await page.getByText('登录后，与门店安心沟通',{exact:true}).waitFor()
  await page.getByText('上海中心店　›',{exact:true}).waitFor()
  assert.equal(await page.locator('.chat-compose').count(),0)
  const chatUrl=page.url()
  await page.getByText('微信登录，开始咨询',{exact:true}).click()
  await page.locator('.login-sheet-dialog').waitFor()
  await settled(page)
  assert.equal(page.url(),chatUrl)
  const consent=page.locator('.login-sheet-dialog input[type=checkbox]')
  assert.equal(await consent.isChecked(),false)
  await page.locator('.login-sheet-photo img').evaluate(img=>img.decode())
  await page.screenshot({path:resolve(output,'login-sheet-390.png')})
  await page.locator('.login-submit').click()
  await page.getByText('请先阅读并同意用户协议与隐私说明。',{exact:true}).waitFor()
  await page.locator('.login-sheet-dialog').getByText('《隐私说明》',{exact:true}).click()
  await page.getByText('登录身份',{exact:true}).waitFor()
  await settled(page)
  await page.getByText('返回',{exact:true}).click()
  await settled(page)
  assert.equal(await consent.isChecked(),false)
  await page.locator('.login-consent-toggle').click()
  assert.equal(await consent.isChecked(),true)
  await page.locator('.login-submit').click()
  await page.getByText('请在微信小程序内登录后办理预约；H5 可浏览门店与项目。',{exact:true}).waitFor()
  await page.locator('.login-guest').click()
  await page.locator('.login-sheet-dialog').waitFor({state:'detached'})
  assert.equal(page.url(),chatUrl)
  await page.getByText('上海中心店　›',{exact:true}).waitFor()
  assert.equal(calls.filter(c=>c.path==='/api/me/chats').length,0)
  checks.push('Consultation opens a consented bottom sheet over the current page; legal links preserve it and browsing creates no conversation')

  await page.getByText('微信登录，开始咨询',{exact:true}).click()
  assert.equal(await consent.isChecked(),false)
  await page.locator('.login-sheet-close').click()
  await page.locator('.login-sheet-dialog').waitFor({state:'detached'})
  await page.getByText('微信登录，开始咨询',{exact:true}).click()
  await settled(page)
  await page.locator('.login-sheet-mask').click({position:{x:20,y:30}})
  await page.locator('.login-sheet-dialog').waitFor({state:'detached'})
  checks.push('Close, backdrop and browsing all dismiss the sheet; reopening starts with unchecked consent')
  await page.screenshot({path:resolve(output,'consultation-guest.png')})

  await visit(page,'/pages/booking/index?storeId=shanghai&serviceId=care-1')
  await page.getByText('下一步 →',{exact:true}).click()
  await page.getByText('舒缓养护',{exact:true}).waitFor()
  await page.getByText('下一步 →',{exact:true}).click()
  await page.locator('.slot-grid').getByText('15:00',{exact:false}).click()
  await page.getByText('下一步 →',{exact:true}).click()
  await page.locator('input[placeholder="请输入称呼"]').fill('测试客户')
  await page.locator('input[placeholder="便于门店确认预约"]').fill('13800000000')
  await page.locator('textarea[placeholder="请勿填写身份证、病历等不必要信息"]').fill('希望安静一些')
  await page.getByText('微信登录后提交',{exact:true}).click()
  await settled(page)
  await page.locator('.login-sheet-dialog').waitFor()
  assert.equal(new URL(page.url()).hash.startsWith('#/pages/booking/index'),true)
  await page.screenshot({path:resolve(output,'booking-login-sheet.png')})
  await page.locator('.login-guest').click()
  await settled(page)
  await page.getByText('微信登录后提交',{exact:true}).waitFor()
  assert.equal(await page.locator('input[placeholder="请输入称呼"]').inputValue(),'测试客户')
  assert.equal(await page.locator('input[placeholder="便于门店确认预约"]').inputValue(),'13800000000')
  assert.equal(await page.locator('textarea[placeholder="请勿填写身份证、病历等不必要信息"]').inputValue(),'希望安静一些')
  assert.equal(calls.filter(c=>c.path==='/api/appointments').length,0)
  checks.push('Booking login returns to the existing form and retains the selected time and customer draft without submitting')

  const signed=await setup({signedIn:true});contexts.push(signed.context)
  await visit(signed.page,'/pages/orders/index')
  await signed.page.getByText('舒缓养护',{exact:true}).waitFor()
  await signed.page.getByText('退出登录',{exact:true}).click()
  await signed.page.getByText('退出登录',{exact:true}).last().click()
  await signed.page.locator('.login-hero-submit').waitFor()
  assert.equal(await signed.page.getByText('舒缓养护',{exact:true}).count(),0)
  const token=await signed.page.evaluate(()=>localStorage.getItem('yht-token'))
  assert.equal(token,null)
  checks.push('Logged-in customers can view their appointments; logout removes the credential and visible personal records')

  const expired=await setup({signedIn:true,expired:true});contexts.push(expired.context)
  await visit(expired.page,'/pages/orders/index')
  await expired.page.locator('.login-hero-submit').waitFor()
  assert.equal(await expired.page.getByText('舒缓养护',{exact:true}).count(),0)
  assert.equal(await expired.page.locator('.customer-login-overlay').count(),0)
  checks.push('An expired backend session returns to an explicit login prompt and does not expose previous records')

  for(const [width,height] of [[375,812],[320,568]]) {
    const small=await setup({width,height});contexts.push(small.context)
    await visit(small.page,'/pages/login/index')
    await small.page.locator('.login-hero-submit').waitFor()
    await small.page.locator('.login-hero-image img').evaluate(img=>img.decode())
    const bounds=await small.page.locator('.login-hero-submit').boundingBox()
    assert(bounds && bounds.x>=0 && bounds.x+bounds.width<=width && bounds.y+bounds.height<=height)
    assert.equal(await small.page.evaluate(w=>document.documentElement.scrollWidth>w,width),false)
    await small.page.screenshot({path:resolve(output,`login-${width}.png`)})
    await visit(small.page,'/pages/chat/index?storeId=shanghai')
    await small.page.getByText('微信登录，开始咨询',{exact:true}).click()
    await settled(small.page)
    const sheet=await small.page.locator('.login-sheet-dialog').boundingBox()
    assert(sheet && sheet.x>=0 && sheet.x+sheet.width<=width && sheet.y>=0 && sheet.y+sheet.height<=height+1)
    await small.page.locator('.login-guest').scrollIntoViewIfNeeded()
    await small.page.screenshot({path:resolve(output,`login-sheet-${width}.png`)})
    await small.page.locator('.login-guest').click()
    checks.push(`Photo login and bottom sheet fit ${width}x${height}, with visible actions and no horizontal overflow`)
  }
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),buildMode:developmentFixture?'development-fixture':'production',checks,errors,h5Files:await buildFiles(),liveApisUsed:false,realWechatLoginValidated:false,realMessagesSent:false},null,2))
  console.log(JSON.stringify({status:'passed',cases:checks.length,output},null,2))
} catch(error) {
  for(let i=0;i<contexts.length;i++) {
    const page=contexts[i].pages()[0]
    await page?.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})
    if(page) { console.error('URL',page.url());console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>Array.from(document.querySelectorAll('.taro_page,.taro_router,.login-page,.legal-page')).map(el=>({cls:el.className,style:el.getAttribute('style'),display:getComputedStyle(el).display,rect:el.getBoundingClientRect().toJSON()})))) }
  }
  console.error({errors,unknown,calls});throw error
} finally {await browser.close()}
