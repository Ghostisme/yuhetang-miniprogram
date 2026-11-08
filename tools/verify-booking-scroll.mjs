import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// Serve only the compiled app and local fixtures; never contact production/WeChat.
const origin='http://127.0.0.1:5182', apiOrigin='https://mp-admin.hetuonian.cn'
const dist=resolve('dist/h5'), output=resolve('backups/booking-scroll')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const contexts=[], checks=[], errors=[], unknown=[], writes=[]
const stores=Array.from({length:12},(_,i)=>({id:`store-${i}`,name:i===0?'上海中心店':`测试门店 ${i}`,enabled:true,onlineBooking:true,image:origin+'/fixture/store.jpg',address:'上海市浦东新区 · 门店地址与楼层信息，用于检查长内容换行',hours:'09:00–23:00',phone:'021-50000000',gallery:[]}))
const services=storeId=>Array.from({length:12},(_,i)=>({id:`care-${i}`,name:`舒缓养护 ${i+1}`,enabled:true,storeId,image:origin+'/fixture/store.jpg',subtitle:'为自己留一段安静时光，按本店开放项目预约',duration:'60分钟'}))
const slots=Array.from({length:48},(_,i)=>({time:`${String(10+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`,capacity:4,used:0,remaining:4,available:true}))
async function fixture(width,height,signedIn=false) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});contexts.push(context)
  if(signedIn)await context.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    localStorage.setItem('yht-token',JSON.stringify({data:'booking-layout-fixture'}))
    localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
  })
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===apiOrigin&&url.pathname.startsWith('/api/')) {
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      if(req.method()!=='GET')writes.push({method:req.method(),path:url.pathname})
      if(url.pathname==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU HE TANG',theme:'sage',hero:{},contact:{},stores,services:[],sections:[],products:[],galleryGroups:[]})
      if(url.pathname==='/api/runtime')return json({customerTemplateIds:[],developmentLogin:false})
      if(signedIn&&url.pathname==='/api/appointments'&&req.method()==='POST') {
        assert.equal(req.headers().authorization,'Bearer booking-layout-fixture')
        assert(req.headers()['idempotency-key'])
        const body=req.postDataJSON()
        assert.equal(body.privacyConsent,true)
        assert.equal(body.name,'测试客户')
        assert.equal(body.phone,'13900003001')
        return json({id:'fixture-booking-layout',storeId:body.storeId,storeName:stores[0].name,serviceId:body.serviceId,serviceName:'舒缓养护 1',bookingDate:body.date,startTime:body.startTime,headcount:body.headcount,status:'PENDING',version:1})
      }
      const match=url.pathname.match(/^\/api\/stores\/(store-\d+)\/(services|therapists|slots)$/)
      if(match) return json(match[2]==='services'?services(match[1]):match[2]==='therapists'?[]:{date:url.searchParams.get('date'),storeId:match[1],slots,rules:{advanceDays:7,maxHeadcount:4}})
      unknown.push(req.method()+' '+url.pathname);return route.fulfill({status:404,headers,json:{message:'Unmocked API blocked'}})
    }
    if(url.origin!==origin) {unknown.push(url.origin+url.pathname);return route.abort()}
    if(url.pathname==='/fixture/store.jpg')return route.fulfill({contentType:'image/jpeg',body:await readFile(resolve('src/assets/login/reception.jpg'))})
    const path=resolve(dist,'.'+url.pathname);assert(path===dist||path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/#/pages/booking/index');await page.locator('.booking-content .choice').first().waitFor()
  return page
}
// ScrollView can own the scroll directly or in a platform component's open shadow root.
function scrollingElement(root) {
  const elements=[]
  function walk(element){elements.push(element);for(const child of element.children)walk(child);if(element.shadowRoot)for(const child of element.shadowRoot.children)walk(child)}
  walk(root)
  return elements.find(el=>el.clientHeight>0&&el.scrollHeight>el.clientHeight+2&&/auto|scroll/.test(getComputedStyle(el).overflowY))||root
}
const scrollState=page=>page.locator('.booking-content').evaluate((root,source)=>{const el=eval('('+source+')')(root);return {top:el.scrollTop,height:el.clientHeight,extent:el.scrollHeight}},scrollingElement.toString())
async function layout(page) {
  const header=await page.locator('.booking-header').boundingBox(),body=await page.locator('.booking-content').boundingBox(),footer=await page.locator('.booking-footer').boundingBox()
  const viewport=page.viewportSize();assert(header&&body&&footer)
  assert(header.y>=-1&&body.height>120,JSON.stringify({header,body,footer,viewport}))
  assert(Math.abs(header.y+header.height-body.y)<2,'Body starts directly below the fixed header')
  assert(Math.abs(body.y+body.height-footer.y)<2,'Footer must not overlap the scrollable content')
  assert(footer.y+footer.height<=viewport.height+1,'Bottom actions fit inside the viewport')
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow')
  return {header,body,footer}
}
async function scrollMiddle(page,label) {
  const before=await layout(page),start=await scrollState(page)
  assert(start.extent>start.height+40,`${label}: fixture must overflow`)
  await page.mouse.move(before.body.x+before.body.width/2,before.body.y+before.body.height/2)
  await page.mouse.wheel(0,900)
  await page.waitForFunction(({source})=>{const root=document.querySelector('.booking-content');return root&&eval('('+source+')')(root).scrollTop>30},{source:scrollingElement.toString()})
  const after=await layout(page)
  assert(Math.abs(before.header.y-after.header.y)<1&&Math.abs(before.footer.y-after.footer.y)<1,`${label}: header/footer stay fixed`)
  assert.equal(await page.evaluate(()=>window.scrollY),0,'Document must never scroll')
  assert.equal(await page.locator('.booking-page').evaluate(el=>el.parentElement.scrollTop),0,'Router page must never scroll')
  return after
}
async function top(page){assert((await scrollState(page)).top<=1,'A different step starts at the top')}
try {
  for(const [width,height] of [[390,844],[414,780],[320,568]]) {
    const page=await fixture(width,height)
    await scrollMiddle(page,'stores')
    const lastStore=page.locator('.booking-content .choice').last();await lastStore.click()
    await page.getByText('下一步 →',{exact:true}).click();await page.locator('.selection-note').waitFor();await top(page)
    await scrollMiddle(page,'services')
    await page.locator('.booking-content .choice').last().click();await page.getByText('下一步 →',{exact:true}).click()
    await page.locator('.slot-grid').waitFor();await top(page);await scrollMiddle(page,'times')
    await page.locator('.slot-grid').getByText('21:45',{exact:false}).click()
    await page.getByText('下一步 →',{exact:true}).click();await page.locator('input[placeholder="请输入称呼"]').waitFor();await top(page)
    await page.locator('input[placeholder="请输入称呼"]').fill('测试客户')
    await page.locator('input[placeholder="便于门店确认预约"]').fill('13900003001')
    await page.locator('textarea').fill('希望安静一些')
    await scrollMiddle(page,'contact form')
    await page.getByText('上一步',{exact:true}).click();await page.locator('.slot-grid').waitFor();await top(page)
    assert.equal(await page.locator('.slot-grid .active').innerText(),'21:45\n余 4 位')
    await page.getByText('下一步 →',{exact:true}).click();await page.locator('input[placeholder="请输入称呼"]').waitFor();await top(page)
    assert.equal(await page.locator('input[placeholder="请输入称呼"]').inputValue(),'测试客户')
    assert.equal(await page.locator('input[placeholder="便于门店确认预约"]').inputValue(),'13900003001')
    assert.equal(await page.locator('textarea').inputValue(),'希望安静一些')
    await page.screenshot({path:resolve(output,`booking-contact-${width}.png`)})
    await page.getByText('微信登录后提交',{exact:true}).click();await page.locator('.login-sheet-dialog').waitFor()
    await page.locator('.login-guest').click();await page.locator('.login-sheet-dialog').waitFor({state:'detached'})
    await layout(page)
    await page.locator('.steps taro-button-core').first().click();await page.locator('.booking-content .choice').first().waitFor();await top(page)
    assert.equal(await page.locator('.choice.selected .card-title').innerText(),'测试门店 11')
    await page.screenshot({path:resolve(output,`booking-stores-${width}.png`)})
    checks.push(`All four steps scroll internally at ${width}x${height}; header/actions remain fixed, step changes reset scroll, selections/drafts survive back navigation and login dismissal`)
  }
  const receiptPage=await fixture(320,568,true)
  await receiptPage.locator('.booking-content .choice').first().click()
  await receiptPage.getByText('下一步 →',{exact:true}).click();await receiptPage.locator('.booking-content .choice').first().click()
  await receiptPage.getByText('下一步 →',{exact:true}).click();await receiptPage.locator('.slot-grid').getByText('10:00',{exact:false}).click()
  await receiptPage.getByText('下一步 →',{exact:true}).click()
  await receiptPage.locator('input[placeholder="请输入称呼"]').fill('测试客户')
  await receiptPage.locator('input[placeholder="便于门店确认预约"]').fill('13900003001')
  await receiptPage.locator('.agree input[type=checkbox]').first().check()
  await receiptPage.getByText('提交预约申请',{exact:true}).click();await receiptPage.locator('.receipt').waitFor()
  const receiptScroll=receiptPage.locator('.booking-receipt-scroll')
  assert(await receiptScroll.evaluate((root,source)=>{const el=eval('('+source+')')(root);return el.scrollHeight>el.clientHeight+40},scrollingElement.toString()))
  await receiptPage.locator('.receipt-card .receipt-row').last().scrollIntoViewIfNeeded()
  assert(await receiptScroll.evaluate((root,source)=>eval('('+source+')')(root).scrollTop>0,scrollingElement.toString()))
  assert.equal(await receiptPage.evaluate(()=>window.scrollY),0)
  assert.equal(await receiptPage.locator('.booking-page').evaluate(el=>el.parentElement.scrollTop),0)
  const receiptActions=await receiptPage.locator('.receipt-actions').boundingBox()
  assert(receiptActions&&receiptActions.y+receiptActions.height<=568+1)
  await receiptPage.locator('.receipt-actions .contact-entry').click()
  await receiptPage.locator('.contact-sheet').waitFor()
  await receiptPage.locator('.contact-sheet-cancel').click()
  await receiptPage.screenshot({path:resolve(output,'booking-receipt-320.png')})
  checks.push('After an isolated fixture submission, the success receipt scrolls internally and its last action is reachable on a 320px screen')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(writes,[{method:'POST',path:'/api/appointments'}])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realMessagesSent:false,checks,errors,unknown,writes},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
} catch(error) {
  for(const [i,context] of contexts.entries()) {
    const page=context.pages()[0];if(!page)continue
    await page.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})
    console.error(await page.evaluate(()=>Array.from(document.querySelectorAll('.booking-page,.booking-wizard,.booking-header,.booking-content,.booking-footer,.taro_page')).map(el=>({cls:el.className,rect:el.getBoundingClientRect().toJSON(),height:el.clientHeight,extent:el.scrollHeight,scroll:el.scrollTop,overflow:getComputedStyle(el).overflowY}))))
  }
  console.error({errors,unknown,writes});throw error
} finally {for(const context of contexts)await context.close();await browser.close()}
