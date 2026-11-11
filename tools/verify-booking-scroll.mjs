import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// Serve only the compiled app and local fixtures; never contact production/WeChat.
const origin='http://127.0.0.1:5182', apiOrigin='https://mp-admin.hetuonian.cn'
const dist=resolve('dist/h5'), output=resolve('backups/booking-scroll')
await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true})
const contexts=[], checks=[], errors=[], unknown=[], writes=[], staffRequests=[]
const stores=Array.from({length:12},(_,i)=>({id:`store-${i}`,name:i===0?'上海中心店':`测试门店 ${i}`,enabled:true,onlineBooking:true,image:origin+'/fixture/store.jpg',address:'上海市浦东新区 · 门店地址与楼层信息，用于检查长内容换行',hours:'09:00–23:00',phone:'021-50000000',gallery:[]}))
const services=storeId=>Array.from({length:12},(_,i)=>({id:`care-${i}`,name:`舒缓养护 ${i+1}`,enabled:true,storeId,image:origin+'/fixture/store.jpg',subtitle:'为自己留一段安静时光，按本店开放项目预约',duration:'60分钟'}))
const slots=Array.from({length:48},(_,i)=>({time:`${String(10+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`,capacity:4,used:0,remaining:4,available:true}))
const therapists=storeId=>{
  const teacher={id:'teacher-intent',storeId,name:'林老师（示例）',grade:'资深调理师',enabled:true,showOnClient:true,resting:false,serviceIds:['care-0']}
  return [teacher,...[
    {id:'wrong-branch',storeId:'other-store'}, {id:'disabled',enabled:false}, {id:'hidden',showOnClient:false},
    {id:'resting',resting:true}, {id:'other-project',serviceIds:['care-1']}
  ].map(item=>({...teacher,...item,name:'不可用于本次预约-'+item.id}))]
}
async function fixture(width,height,signedIn=false,teacherScenario='empty') {
  let teacherRequests=0
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
      if(url.pathname==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',hero:{},contact:{},stores,services:[],sections:[],products:[],galleryGroups:[]})
      if(url.pathname==='/api/runtime')return json({customerTemplateIds:[],developmentLogin:false})
      if(url.pathname==='/api/me/profile')return json({name:'测试客户',phone:'13900003001',phoneVerified:true,memberVerified:false,complete:true})
      if(signedIn&&url.pathname==='/api/appointments'&&req.method()==='POST') {
        assert.equal(req.headers().authorization,'Bearer booking-layout-fixture')
        assert(req.headers()['idempotency-key'])
        const body=req.postDataJSON()
        assert.equal(body.privacyConsent,true)
        assert.equal(body.name,'测试客户')
        assert.equal(body.phone,'13900003001')
        assert.equal(body.therapistIntentId,'teacher-intent','Submit the selected staff ID instead of a label/index')
        return json({id:'fixture-booking-layout',storeId:body.storeId,storeName:stores[0].name,serviceId:body.serviceId,serviceName:'舒缓养护 1',bookingDate:body.date,startTime:body.startTime,headcount:body.headcount,therapistIntentName:'林老师（示例）',status:'PENDING',version:1})
      }
      const match=url.pathname.match(/^\/api\/stores\/(store-\d+)\/(services|therapists|slots)$/)
      if(match) {
        if(match[2]==='therapists') {
          staffRequests.push({teacherScenario,storeId:match[1],attempt:teacherRequests+1})
          if(teacherScenario==='retry'&&++teacherRequests===1)return route.fulfill({status:500,headers,json:{message:'Fixture staff API unavailable'}})
          return json(teacherScenario==='empty'?[]:therapists(match[1]))
        }
        return json(match[2]==='services'?services(match[1]):{date:url.searchParams.get('date'),storeId:match[1],slots,rules:{advanceDays:7,maxHeadcount:4}})
      }
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
async function contactStep(page) {
  await page.locator('.booking-content .choice').first().click()
  await page.getByText('下一步 →',{exact:true}).click();await page.locator('.booking-content .choice').first().click()
  await page.getByText('下一步 →',{exact:true}).click();await page.locator('.slot-grid').getByText('10:00',{exact:false}).click()
  await page.getByText('下一步 →',{exact:true}).click()
}
async function chooseTeacher(page) {
  const field=page.locator('.therapist-field')
  await field.locator('.option-select-trigger').click()
  const overlay=page.locator('.option-select-dialog:visible')
  await overlay.waitFor({state:'visible'})
  assert.deepEqual(await overlay.locator('.option-select-label').allTextContents(),['门店安排（不指定）','林老师（示例） · 资深调理师'])
  await overlay.locator('.option-select-option').nth(1).click()
  await overlay.waitFor({state:'detached'})
  assert((await field.locator('.picker').innerText()).includes('林老师（示例）'))
}
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
    await page.getByText('本项目暂未开放调理师意向，由门店为您安排。',{exact:true}).waitFor()
    assert.equal(await page.locator('.therapist-field .option-select-trigger').count(),0,'Empty choices must not show a fake dropdown')
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
  const retryPage=await fixture(390,844,false,'retry')
  await contactStep(retryPage)
  await retryPage.locator('input[placeholder="请输入称呼"]').fill('保留草稿')
  await retryPage.getByText('重新加载调理师',{exact:true}).click()
  await chooseTeacher(retryPage)
  assert.equal(await retryPage.locator('input[placeholder="请输入称呼"]').inputValue(),'保留草稿')
  await retryPage.screenshot({path:resolve(output,'booking-therapist-selection-390.png')})
  await retryPage.locator('.steps taro-button-core').nth(1).click()
  // Change to a project that has no matching staff; do not submit an old intent.
  await retryPage.locator('.booking-content .choice').nth(2).click()
  await retryPage.getByText('下一步 →',{exact:true}).click()
  await retryPage.getByText('下一步 →',{exact:true}).click()
  await retryPage.getByText('本项目暂未开放调理师意向，由门店为您安排。',{exact:true}).waitFor()
  assert.equal(await retryPage.locator('.therapist-field .picker').innerText(),'门店安排（不指定）')
  assert.equal(await retryPage.locator('input[placeholder="请输入称呼"]').inputValue(),'保留草稿')
  checks.push('A failed staff request can be retried without losing the draft; the real picker excludes hidden/resting/disabled/other-store/other-project staff; changing the project clears the old intent')
  const receiptPage=await fixture(320,568,true,'eligible')
  await contactStep(receiptPage)
  await chooseTeacher(receiptPage)
  await receiptPage.locator('input[placeholder="请输入称呼"]').fill('测试客户')
  await receiptPage.locator('input[placeholder="便于门店确认预约"]').fill('13900003001')
  await receiptPage.locator('.agree input[type=checkbox]').first().check()
  await receiptPage.getByText('提交预约申请',{exact:true}).click();await receiptPage.locator('.receipt').waitFor()
  assert((await receiptPage.locator('.receipt-card').innerText()).includes('林老师（示例）'))
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
  checks.push('An isolated submission sends the chosen therapist ID and displays their name on the receipt; the receipt scrolls internally with reachable bottom actions on a 320px screen')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[]);assert.deepEqual(writes,[{method:'POST',path:'/api/appointments'}])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realMessagesSent:false,checks,errors,unknown,writes},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
} catch(error) {
  for(const [i,context] of contexts.entries()) {
    const page=context.pages()[0];if(!page)continue
    await page.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})
    console.error(await page.evaluate(()=>({staff:document.querySelector('.therapist-field')?.outerHTML,layout:Array.from(document.querySelectorAll('.booking-page,.booking-wizard,.booking-header,.booking-content,.booking-footer,.taro_page')).map(el=>({cls:el.className,rect:el.getBoundingClientRect().toJSON(),height:el.clientHeight,extent:el.scrollHeight,scroll:el.scrollTop,overflow:getComputedStyle(el).overflowY}))})))
  }
  console.error({errors,unknown,writes,staffRequests});throw error
} finally {for(const context of contexts)await context.close();await browser.close()}
