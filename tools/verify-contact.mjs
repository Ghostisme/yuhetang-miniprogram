import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

const origin='http://127.0.0.1:5182',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/contact-verification')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],checks=[],errors=[],unknown=[]
const stores=[{id:'shanghai',name:'上海中心店',district:'浦东新区',tag:'城市空间',enabled:true,onlineBooking:true,image:origin+'/fixture/store.jpg',address:'上海市浦东新区花园石桥路158号',hours:'09:00–23:00',phone:'021-50181919',gallery:[],description:'为自己留一段安静的养护时光。'},{id:'disabled',name:'停用门店',enabled:false,phone:'00000000'}]
const care={id:'care-1',name:'舒缓养护',enabled:true,storeId:'shanghai',image:origin+'/fixture/store.jpg',subtitle:'让身心歇一歇',duration:'60分钟',description:'以本店安排为准。',steps:[]}
const site={brandName:'裕和堂',brandEnglish:'YU Health',tagline:'东方养护，用心相待',theme:'sage',hero:{title:'安心相遇，从这里开始',subtitle:'留一段自己的时光',image:origin+'/fixture/store.jpg',button:'申请预约'},brandStory:'从每一次接待开始。',contact:{phone:'021-60000000',message:'欢迎与我们说说您的需要。'},stores:[{...stores[0],services:[care]},stores[1]],services:[care],sections:[],products:[],galleryGroups:[]}
async function fixture(width=390,height=844,signedIn=false){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});contexts.push(context)
  const calls=[]
  if(signedIn)await context.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    localStorage.setItem('yht-token',JSON.stringify({data:'contact-fixture'}))
    localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
  })
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===api&&url.pathname.startsWith('/api/')){
      const path=url.pathname,headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      calls.push({path,method:req.method(),body:req.postDataJSON()})
      if(path==='/api/site')return json(site)
      if(path==='/api/runtime')return json({customerTemplateIds:[],developmentLogin:false})
      if(path==='/api/stores/shanghai/services')return json([care])
      if(path==='/api/stores/shanghai/therapists')return json([])
      if(path==='/api/stores/shanghai/slots')return json({date:url.searchParams.get('date'),storeId:'shanghai',slots:[{time:'15:00',capacity:4,used:0,remaining:4,available:true}],rules:{advanceDays:7,maxHeadcount:4}})
      if(path==='/api/me/chats'&&signedIn&&req.method()==='POST')return json({id:'chat-fixture',status:'OPEN'})
      if(path==='/api/me/chats/chat-fixture/messages'&&signedIn&&req.method()==='GET')return json({items:[],conversation:{id:'chat-fixture',status:'OPEN'}})
      unknown.push(req.method()+' '+path);return route.fulfill({status:404,headers,json:{message:'Unmocked API blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+url.pathname);return route.abort()}
    if(url.pathname==='/fixture/store.jpg')return route.fulfill({contentType:'image/jpeg',body:await readFile(resolve('src/assets/login/reception.jpg'))})
    const path=resolve(dist,'.'+url.pathname);assert(path===dist||path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {page,calls}
}
async function visit(page,path){await page.goto('about:blank');await page.goto(origin+'/#'+path)}
async function fits(page,selector){const box=await page.locator(selector).filter({visible:true}).boundingBox();assert(box&&box.y>=-1&&box.y+box.height<=page.viewportSize().height+1,selector+' fits the viewport');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
try{
  for(const width of [320,390,414]){
    const {page,calls}=await fixture(width,width===320?568:844)
    for(const route of ['home','catalog','stores','orders']){
      await visit(page,`/pages/${route}/index`)
      await page.locator('taro-tabbar').getByText('客服',{exact:true}).waitFor()
      assert.equal(await page.locator('.customer-service').count(),0,'No repeated channel buttons in '+route)
      await page.locator('taro-tabbar').getByText('客服',{exact:true}).click()
      await page.locator('.contact-page').waitFor();await fits(page,'taro-tabbar')
      assert.equal(await page.locator('.contact-channel-online').count(),1)
      assert.equal(await page.locator('.contact-channel-wechat').count(),0,'H5 cannot impersonate native contact')
      assert.equal(calls.filter(c=>c.method==='POST').length,0,'Choosing the contact tab does not create an empty chat')
    }
    await page.screenshot({path:resolve(output,`contact-center-${width}.png`)})
    await visit(page,'/pages/store-detail/index?storeId=shanghai');await page.locator('.store-detail-page .contact-entry').waitFor();await fits(page,'.contact-entry')
    await page.locator('.contact-entry').click();await page.locator('.contact-sheet').waitFor();await fits(page,'.contact-sheet')
    assert.equal(await page.locator('.contact-sheet-subtitle').innerText(),'上海中心店')
    assert((await page.locator('.contact-phone').innerText()).includes('021-50181919'))
    await page.screenshot({path:resolve(output,`contact-sheet-${width}.png`)})
    await page.locator('.contact-mask').click({position:{x:10,y:10}});await page.locator('.contact-sheet').waitFor({state:'detached'})
    await visit(page,'/pages/booking/index?storeId=shanghai&serviceId=care-1')
    await page.getByText('下一步 →',{exact:true}).click();await page.getByText('舒缓养护',{exact:true}).waitFor();await page.getByText('下一步 →',{exact:true}).click()
    await page.locator('.slot-grid').getByText('15:00',{exact:false}).click();await page.getByText('下一步 →',{exact:true}).click()
    await page.locator('input[placeholder="请输入称呼"]').fill('测试客户')
    await page.locator('input[placeholder="便于门店确认预约"]').fill('13900003001')
    await page.locator('textarea').fill('希望安静一些')
    await page.locator('.contact-entry').click();await fits(page,'.contact-sheet')
    await page.locator('.contact-sheet-cancel').click();await page.locator('.contact-sheet').waitFor({state:'detached'})
    assert.equal(await page.locator('textarea').inputValue(),'希望安静一些')
    await page.locator('.contact-entry').click();await page.locator('.contact-channel-online').click()
    await page.locator('.chat-login-card').waitFor()
    assert.equal(new URL(page.url()).hash,'#/pages/chat/index?storeId=shanghai')
    assert.equal(calls.filter(c=>c.method==='POST').length,0)
    // Let Taro finish its page transition before exercising browser back.
    await page.waitForFunction(()=>document.querySelector('.chat-page')?.closest('.taro_page')?.classList.contains('taro_page_stationed'))
    await page.goBack();await page.locator('.booking-page').filter({visible:true}).waitFor()
    assert.equal(await page.locator('input[placeholder="请输入称呼"]').inputValue(),'测试客户')
    assert.equal(await page.locator('textarea').inputValue(),'希望安静一些')
    assert.equal(await page.locator('.contact-sheet').count(),0)
    await fits(page,'.booking-footer');await page.screenshot({path:resolve(output,`booking-footer-${width}.png`)})
    checks.push(`${width}px: one contact tab across all main sections, store-specific bottom menu, no automatic login/chat creation, booking draft survives consultation and return`)
  }
  const signed=await fixture(390,844,true)
  await visit(signed.page,'/pages/store-detail/index?storeId=shanghai');await signed.page.locator('.contact-entry').click();await signed.page.locator('.contact-channel-online').click()
  await signed.page.locator('.chat-compose').waitFor()
  assert.deepEqual(signed.calls.filter(c=>c.path==='/api/me/chats'),[{path:'/api/me/chats',method:'POST',body:{storeId:'shanghai'}}])
  await signed.page.locator('.chat-contact-footer .contact-entry').click();await signed.page.locator('.contact-sheet').waitFor()
  assert.equal(await signed.page.locator('.contact-channel-online').count(),0,'No recursive online consultation entry from its own chat')
  await signed.page.locator('.contact-sheet-close').click()
  await visit(signed.page,'/pages/contact/index');await signed.page.locator('.contact-store-name').getByText('品牌客服 · 总部接待',{exact:true}).waitFor()
  // A fresh app uses headquarters by default. The picker exposes enabled stores only.
  const picker=signed.page.locator('taro-picker-core')
  await picker.evaluate(el=>el.dispatchEvent(new CustomEvent('change',{bubbles:true,detail:{value:1}})))
  await signed.page.locator('.contact-store-name').getByText('上海中心店',{exact:true}).waitFor()
  assert((await signed.page.locator('.contact-phone').innerText()).includes('021-50181919'))
  await signed.page.locator('taro-tabbar').getByText('门店',{exact:true}).click()
  await signed.page.locator('taro-tabbar').getByText('客服',{exact:true}).click()
  await signed.page.locator('.contact-store-name').getByText('上海中心店',{exact:true}).waitFor()
  assert((await signed.page.locator('.contact-phone').innerText()).includes('021-50181919'))
  checks.push('An authenticated customer creates one chat only after explicitly choosing online consultation; selected store and phone agree, and the chat menu cannot open itself recursively')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realMessagesSent:false,checks,errors,unknown},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
}catch(error){for(const [i,context]of contexts.entries()){const page=context.pages()[0];if(page)await page.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})}console.error({errors,unknown});throw error}
finally{for(const context of contexts)await context.close();await browser.close()}
