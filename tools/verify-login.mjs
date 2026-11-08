import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'

// Run the real production H5 bundle against isolated fixtures. Native wx.login
// is exercised separately by auth-api.test.ts; a browser must never fake it.
const origin='http://127.0.0.1:5182', apiOrigin='https://mp-admin.hetuonian.cn'
const dist=resolve('dist/h5'), output=resolve('backups/login-verification')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const checks=[],errors=[],unknown=[],calls=[]
const store={id:'shanghai',name:'上海中心店',enabled:true,onlineBooking:true,image:'',address:'测试门店地址',hours:'09:00–23:00',phone:'021-50000000',gallery:[]}
const service={id:'care-1',name:'舒缓养护',enabled:true,storeId:'shanghai',image:'',subtitle:'让身心歇一歇',duration:'60分钟'}
const site={brandName:'裕和堂',brandEnglish:'YU HE TANG',theme:'sage',hero:{},contact:{phone:'021-50000000'},stores:[store],services:[],sections:[],products:[],galleryGroups:[]}
const runtime={developmentLogin:false,customerTemplateIds:[]}
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
async function setup({signedIn=false,expired=false,width=390}={}) {
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true})
  await context.addInitScript(signedIn=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    if(signedIn) {
      localStorage.setItem('yht-token',JSON.stringify({data:'fixture-customer-token'}))
      localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
    }
  },signedIn)
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===apiOrigin && url.pathname.startsWith('/api/')) {
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}
      const json=(data,status=200)=>route.fulfill({status,headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      calls.push({path:url.pathname,method:req.method(),authorization:req.headers().authorization})
      if(url.pathname==='/api/site')return json(site)
      if(url.pathname==='/api/runtime')return json(runtime)
      if(url.pathname==='/api/stores/shanghai/services')return json([service])
      if(url.pathname==='/api/stores/shanghai/therapists')return json([])
      if(url.pathname==='/api/stores/shanghai/slots')return json({date:url.searchParams.get('date'),storeId:'shanghai',slots:[{time:'15:00',capacity:4,used:0,remaining:4,available:true}],rules:{advanceDays:7,maxHeadcount:4}})
      if(url.pathname.startsWith('/api/me/')) {
        assert.equal(req.headers().authorization,'Bearer fixture-customer-token')
        if(expired)return json({message:'登录已失效'},401)
        if(url.pathname==='/api/me/appointments')return json([appointment])
        if(url.pathname==='/api/me/subscriptions')return json({templates:[],items:[],development:false})
      }
      unknown.push(req.method()+' '+url.pathname);return json({message:'Unmocked request blocked'},404)
    }
    if(url.origin!==origin) {unknown.push(req.url());return route.abort()}
    const path=resolve(dist,'.'+url.pathname)
    assert(path===dist || path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {context,page}
}
const contexts=[]
try {
  const guest=await setup();contexts.push(guest.context)
  const page=guest.page
  await visit(page,'/pages/orders/index')
  await page.getByText('登录，留住每一次养护时光',{exact:true}).waitFor()
  await page.getByText('微信登录',{exact:true}).click()
  await settled(page)
  await page.getByText('安心相遇，从这里开始',{exact:true}).waitFor()
  assert.equal(calls.filter(c=>c.path.startsWith('/api/me/') || c.path.startsWith('/api/auth/')).length,0)
  const consent=page.locator('.login-consent input[type=checkbox]')
  assert.equal(await consent.isChecked(),false)
  await page.locator('.login-submit').scrollIntoViewIfNeeded()
  await page.waitForTimeout(350) // Taro's page transition must finish before visual capture.
  await page.screenshot({path:resolve(output,'login-390.png'),fullPage:true})
  checks.push('Guest sees an explicit login entry; no customer API or silent login is called')

  await page.locator('.login-submit').click()
  await page.getByText('请先阅读并同意用户协议与隐私说明。',{exact:true}).waitFor()
  assert.equal(calls.filter(c=>c.path.startsWith('/api/auth/')).length,0)
  await page.getByText('《隐私说明》',{exact:true}).click()
  await page.getByText('登录身份',{exact:true}).waitFor()
  await page.waitForTimeout(400)
  await page.getByText('返回',{exact:true}).click()
  await settled(page)
  await page.getByText('微信授权登录',{exact:true}).waitFor()
  assert.equal(await consent.isChecked(),false)
  checks.push('Consent defaults off; legal links open the actual text and do not check the agreement')

  await page.locator('.login-consent-toggle').click()
  assert.equal(await consent.isChecked(),true)
  await page.locator('.login-submit').click()
  await page.getByText('请在微信小程序内登录后办理预约；H5 可浏览门店与项目。',{exact:true}).waitFor()
  assert.equal(calls.filter(c=>c.path.startsWith('/api/auth/')).length,0)
  await page.getByText('先逛逛，暂不登录',{exact:false}).click()
  await settled(page)
  await page.getByText('登录，留住每一次养护时光',{exact:true}).waitFor()
  checks.push('Production H5 explains WeChat login; guest returns to the original page without a fabricated account')

  await visit(page,'/pages/chat/index?storeId=shanghai')
  await page.getByText('登录后，与门店安心沟通',{exact:true}).waitFor()
  await page.getByText('上海中心店　›',{exact:true}).waitFor()
  assert.equal(await page.locator('.chat-compose').count(),0)
  await page.getByText('微信登录，开始咨询',{exact:true}).click()
  await settled(page)
  await page.getByText('先逛逛，暂不登录',{exact:false}).click()
  await settled(page)
  await page.getByText('登录后，与门店安心沟通',{exact:true}).waitFor()
  await page.getByText('上海中心店　›',{exact:true}).waitFor()
  assert.equal(calls.filter(c=>c.path==='/api/me/chats').length,0)
  await page.screenshot({path:resolve(output,'consultation-guest.png'),fullPage:true})
  checks.push('Guest consultation preserves the selected store and creates no hidden conversation')

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
  await page.getByText('微信授权登录',{exact:true}).waitFor()
  await page.getByText('先逛逛，暂不登录',{exact:false}).click()
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
  await signed.page.getByText('登录，留住每一次养护时光',{exact:true}).waitFor()
  assert.equal(await signed.page.getByText('舒缓养护',{exact:true}).count(),0)
  const token=await signed.page.evaluate(()=>localStorage.getItem('yht-token'))
  assert.equal(token,null)
  checks.push('Logged-in customers can view their appointments; logout removes the credential and visible personal records')

  const expired=await setup({signedIn:true,expired:true});contexts.push(expired.context)
  await visit(expired.page,'/pages/orders/index')
  await expired.page.getByText('登录，留住每一次养护时光',{exact:true}).waitFor()
  assert.equal(await expired.page.getByText('舒缓养护',{exact:true}).count(),0)
  await expired.page.getByText('去登录',{exact:true}).click()
  await settled(expired.page)
  await expired.page.getByText('微信授权登录',{exact:true}).waitFor()
  checks.push('An expired backend session returns to an explicit login prompt and does not expose previous records')

  const small=await setup({width:375});contexts.push(small.context)
  await visit(small.page,'/pages/login/index')
  await small.page.getByText('微信授权登录',{exact:true}).waitFor()
  const bounds=await small.page.locator('.login-submit').boundingBox()
  assert(bounds && bounds.x>=0 && bounds.x+bounds.width<=375)
  assert.equal(await small.page.evaluate(()=>document.documentElement.scrollWidth>375),false)
  await small.page.screenshot({path:resolve(output,'login-375.png'),fullPage:true})
  checks.push('Login layout fits 375px and 390px phone widths without horizontal overflow')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),checks,errors,h5Files:await buildFiles(),liveApisUsed:false,realWechatLoginValidated:false,realMessagesSent:false},null,2))
  console.log(JSON.stringify({status:'passed',cases:checks.length,output},null,2))
} catch(error) {
  for(let i=0;i<contexts.length;i++) {
    const page=contexts[i].pages()[0]
    await page?.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})
    if(page) { console.error('URL',page.url());console.error(await page.locator('body').innerText());console.error(await page.evaluate(()=>Array.from(document.querySelectorAll('.taro_page,.taro_router,.login-page,.legal-page')).map(el=>({cls:el.className,style:el.getAttribute('style'),display:getComputedStyle(el).display,rect:el.getBoundingClientRect().toJSON()})))) }
  }
  console.error({errors,unknown,calls});throw error
} finally {await browser.close()}
