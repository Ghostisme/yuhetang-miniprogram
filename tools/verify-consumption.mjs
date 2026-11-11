import {assertFullText} from './ui-fit.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,sep,extname} from 'node:path'

// All API traffic is intercepted. No live customer data or real payments are used.
const origin='http://127.0.0.1:5191',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),out=resolve('backups/consumption')
await mkdir(out,{recursive:true})
const dictionary=JSON.parse(await readFile('src/i18n/messages.json','utf8'))
const tr=(key,locale)=>locale==='zh'?key:dictionary[key]?.[locale]||key
const errors=[],unknown=[],checks=[],browser=await chromium.launch({channel:'msedge',headless:true})
const stores=[{id:'shanghai',name:'上海中心店'},{id:'yuyao',name:'余姚路店'}]
const first={id:'entry-live',storeId:'shanghai',storeName:'上海中心店',source:'WALLET',projectName:'中医推拿 60 分钟',paidFen:8850,businessAt:'2026-11-09T11:25:00+08:00',referenceNo:'00000000000000000000000001234567',publicNote:'本次使用会员储值',accountLabel:'储值账户',balanceAfterFen:383951,status:'RECORDED',version:1}
const second={...first,id:'legacy-old',storeId:'yuyao',storeName:'余姚路店',source:'LEGACY',projectName:'扶阳悬灸',paidFen:12025,businessAt:'2025-10-02T11:00:00+08:00',referenceNo:'LEGACY-001',accountLabel:'',balanceAfterFen:null,status:'VOIDED'}
async function fixture(locale='zh',width=390,{signedIn=true,verified=true,empty=false,pageName='consumption',source=false}={}){
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true}),state={calls:[],fail:false,items:empty?[]:structuredClone([first,second])}
  if(source)state.items[0]={...first,id:'ku52-order-test',source:'KU52',balanceAfterFen:null}
  context.setDefaultTimeout(10000)
  await context.addInitScript(({locale,signedIn})=>{
    localStorage.setItem('user-locale',JSON.stringify({data:locale}))
    if(signedIn){localStorage.setItem('yht-token',JSON.stringify({data:'consumption-fixture'}));localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}));localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))}
  },{locale,signedIn})
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname
    if(url.origin===api&&path.startsWith('/api/')){
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'},json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push(path+url.search)
      if(path==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU Health',stores:[],services:[],products:[],galleryGroups:[],hero:{},contact:{}})
      if(path==='/api/runtime')return json({developmentLogin:false,customerProfiles:true})
      assert(signedIn);assert.equal(req.headers().authorization,'Bearer consumption-fixture')
      if(path==='/api/me/profile')return json({name:'合成测试会员',phone:'13900006011',phoneVerified:verified,complete:verified,memberVerified:true,sources:['MINIPROGRAM']})
      if(path==='/api/me/appointments')return json([])
      if(path==='/api/me/wallets')return json({accounts:[],lookupStatus:'MIGRATION_PENDING',memberVerified:true,balanceKnown:false})
      assert(verified,'Unverified customers cannot read consumption records')
      if(path==='/api/me/consumption-records'){
        if(state.fail)return route.fulfill({status:500,headers,json:{message:'消费记录暂未加载'}})
        const selected=url.searchParams.get('storeId'),items=state.items.filter(item=>!selected||item.storeId===selected)
        return json({items,total:items.length,page:1,pageSize:20,stores,historyComplete:false,scope:'RECORDED_ONLY',asOf:new Date().toISOString(),sourceSync:source?{enabled:true,state:'READY',lastSuccess:'2026-11-10T10:10:00+08:00',historyComplete:false}:undefined})
      }
      if(path.startsWith('/api/me/consumption-records/'))return json(state.items.find(item=>item.id===path.split('/').at(-1)))
      unknown.push(path);return route.fulfill({status:404,headers,json:{message:'Unmocked API blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+path);return route.abort()}
    const p=resolve(dist,'.'+path);assert(p===dist||p.startsWith(dist+sep));const file=extname(p)?p:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/#/pages/'+pageName+'/index');return {page,context,state}
}
try{
  for(const locale of ['zh','en','ja']){
    const {page,context,state}=await fixture(locale,320,{source:true})
    try{
      await page.locator('.consumption-card').nth(1).waitFor()
      await page.locator('.consumption-migration-note').filter({hasText:tr('消费记录在后台定时同步，日期和门店仅用于筛选已同步记录。',locale)}).waitFor()
      const row=await page.locator('.customer-heading-top').boundingBox(),language=await page.locator('.customer-heading-top .language-switcher').boundingBox()
      assert(language.y>=row.y-1&&language.y+language.height<=row.y+row.height+1)
      assert(row.y<50)
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      await page.screenshot({path:resolve(out,`source-history-${locale}-320.png`)})
      await page.locator('.consumption-card').first().click();await page.locator('.consumption-detail').waitFor()
      assert.equal(await page.getByText(tr('消费后余额',locale),{exact:true}).count(),0,'Source orders do not invent historical card balances')
      assert(!state.calls.some(path=>path.includes('sync')),'The customer UI never calls the collector or worker API')
      checks.push(`${locale}/320: source history carries scheduled-sync status, incomplete history is labelled, compact language header, no invented balance or collector call`)
    }finally{await context.close()}
  }
  for(const locale of ['zh','en','ja'])for(const width of [320,390,414]){
    const {page,context,state}=await fixture(locale,width)
    try{
      await page.locator('.consumption-card').nth(1).waitFor();assert.match(await page.locator('.consumption-card').first().innerText(),/88\.50/)
      await page.locator('.consumption-migration-note').filter({hasText:tr('当前仅展示已登记或已迁入的消费。酷鼠历史明细正在分批核对，未显示不代表没有消费。',locale)}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      await page.locator('.consumption-card').first().click();await page.locator('.consumption-detail').waitFor()
      await page.getByText(first.referenceNo,{exact:true}).waitFor();await page.getByText(tr('消费后余额',locale),{exact:true}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      await page.screenshot({path:resolve(out,`details-${locale}-${width}.png`)})
      await page.locator('.consumption-back').click();await page.locator('.consumption-card').nth(1).click();await page.locator('.consumption-detail.is-voided').waitFor()
      assert.equal(await page.getByText(tr('消费后余额',locale),{exact:true}).count(),0,'Legacy history must not fabricate a balance')
      await page.getByText(tr('此条历史记录已作废，请以核对后的有效记录为准。',locale),{exact:true}).waitFor()
      await page.locator('.consumption-back').click();await page.locator('.consumption-card').nth(1).waitFor()
      // Only the central content scrolls; the title and filters keep their position.
      const before=await page.locator('.consumption-header').boundingBox()
      await page.locator('.consumption-scroll').evaluate(node=>{const inner=node.querySelector('.taro-scroll-view')||node;inner.scrollTop=inner.scrollHeight})
      const after=await page.locator('.consumption-header').boundingBox();assert.equal(after.y,before.y)
      assert(!state.calls.some(path=>path.includes('/wallet-service')),'History never depends on official-account commands')
      await page.screenshot({path:resolve(out,`history-${locale}-${width}.png`)})
      checks.push(`${locale}/${width}: consumption list, original order number, detail/return, voided legacy state, no fabricated balance, fixed header, no horizontal scrolling`)
    }finally{await context.close()}
  }
  {
    const {page,context,state}=await fixture()
    try{
      await page.locator('.consumption-card').nth(1).waitFor()
      state.fail=true;await page.locator('.consumption-title-row .consumption-text-button').click();await page.locator('.consumption-error').waitFor();assert.equal(await page.locator('.consumption-card').count(),2)
      state.fail=false;state.items[0].status='REVERSED';await page.locator('.consumption-title-row .consumption-text-button').click();await page.locator('.consumption-card.is-reversed').waitFor()
      await page.locator('.consumption-card.is-reversed').click();await page.locator('.consumption-invalid-note').filter({hasText:'此笔消费已冲正'}).waitFor()
      checks.push('Failed refresh keeps the last result with an error; a later reversal updates the record and detail')
    }finally{await context.close()}
  }
  for(const verified of [true,false]){
    const {page,context,state}=await fixture('zh',390,{verified,empty:true})
    try{
      await page.getByText(verified?'暂未查到已登记的消费':'先验证您的手机号',{exact:true}).waitFor()
      assert.equal(state.calls.some(path=>path.startsWith('/api/me/consumption-records')),verified)
      checks.push(verified?'Empty history explicitly explains gradual migration':'Phone authorization is required before any consumption-history request')
    }finally{await context.close()}
  }
  {
    const {page,context,state}=await fixture('zh',390,{signedIn:false})
    try{await page.locator('.customer-login-hero').waitFor();assert.equal(state.calls.some(path=>path.startsWith('/api/me/')),false);checks.push('Guests cannot request profile or consumption data')}finally{await context.close()}
  }
  {
    const {page,context}=await fixture('zh',390,{pageName:'orders'})
    try{await page.locator('.balance-summary-consumption').click();await page.locator('.consumption-card').first().waitFor();checks.push('My appointments provides a direct consumption-history entry')}finally{await context.close()}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  const report={status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realPaymentsUsed:false,checks,errors,unknown}
  await writeFile(resolve(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await browser.close()}
