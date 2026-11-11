import {assertFullText} from './ui-fit.mjs'
import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,sep,extname} from 'node:path'

// Compiled UI only. Requests never reach the live server or WeChat.
const origin='http://127.0.0.1:5187',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/member-wallet')
await mkdir(output,{recursive:true})
const dictionary=JSON.parse(await readFile('src/i18n/messages.json','utf8'))
const tr=(key,locale)=>locale==='zh'?key:dictionary[key]?.[locale]||key
const errors=[],unknown=[],checks=[]
const browser=await chromium.launch({channel:'msedge',headless:true})
const date='2026-11-09T10:00:00+08:00'
const accounts=[{id:'wallet-a',storeName:'上海中心店',label:'储值账户',balanceFen:392801,version:1,openingAsOf:date,updatedAt:date},{id:'wallet-b',storeName:'余姚路店',label:'储值账户',balanceFen:10020,version:1,openingAsOf:date,updatedAt:date}]
async function fixture(locale,width,{verified=true,empty=false,signedIn=true,member=true,zero=false,pageName='wallet',fakeClock=false,source=false}={}){
  const state={bound:false,issues:0,calls:[],empty,walletFail:false,serviceFail:false,accounts:zero?[{...accounts[0],balanceFen:0}]:structuredClone(accounts)},context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true})
  if(source)state.accounts=[{...accounts[0],id:'ku52-source-a',source:'KU52',storeName:'常德路店',label:'七折卡',balanceFen:601800,cardNumber:'TEST-CARD-A',validity:'2026.07.23 - 2027.07.23'},{...accounts[1],id:'ku52-source-b',source:'KU52',storeName:'上海中心店',label:'五折卡',balanceFen:153300,cardNumber:'TEST-CARD-B'},...['c','d'].map(key=>({...accounts[0],id:'ku52-source-'+key,source:'KU52',balanceFen:0,cardNumber:'TEST-CARD-'+key}))]
  context.setDefaultTimeout(10000)
  await context.addInitScript(({locale,signedIn})=>{
    if(location.origin!=='http://127.0.0.1:5187')return
    localStorage.setItem('user-locale',JSON.stringify({data:locale}))
    if(signedIn){localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}));localStorage.setItem('yht-token',JSON.stringify({data:'member-wallet-fixture'}));localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))}
  },{locale,signedIn})
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method()
    if(url.origin===api&&path.startsWith('/api/')){
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(method==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push(method+' '+path)
      if(path==='/api/runtime')return json({customerProfiles:true,developmentLogin:false})
      if(path==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU Health',stores:[],services:[],products:[],galleryGroups:[],sections:[],hero:{},contact:{}})
      assert.equal(req.headers().authorization,'Bearer member-wallet-fixture')
      if(path==='/api/me/profile')return json({name:'余额测试会员',phone:'13900006001',phoneVerified:verified,memberVerified:member,memberStatus:member?'MEMBER':'NON_MEMBER',memberGrade:member?'金卡':'',sources:['MINIPROGRAM'],complete:true})
      if(path==='/api/me/appointments')return json([])
      assert(verified,'Unverified customer cannot request financial or binding data')
      if(path==='/api/me/wallets')return state.walletFail?route.fulfill({status:500,headers,json:{message:'余额暂未加载'}}):json({accounts:state.empty?[]:state.accounts,lookupStatus:state.empty?(member?'MIGRATION_PENDING':'MEMBERSHIP_PENDING'):'AVAILABLE',memberVerified:member,balanceKnown:!state.empty,totalFen:state.empty?null:state.accounts.reduce((sum,a)=>sum+a.balanceFen,0),balanceScope:source?'LOCAL_AND_SOURCE_CARDS':'MIGRATED_ACCOUNTS_ONLY',sourceSync:source?{enabled:true,state:'READY',lastSuccess:date,intervalSeconds:300,historyComplete:false}:undefined})
      if(path==='/api/me/wallet-service/code'&&method==='POST'){state.issues++;return json({command:'绑定 ABCDEFGH2345',expiresAt:new Date(Date.now()+300000).toISOString()})}
      if(path==='/api/me/wallet-service'&&method==='DELETE'){state.bound=false;return json({saved:true})}
      if(path==='/api/me/wallet-service')return state.serviceFail?route.fulfill({status:500,headers,json:{message:'Service binding unavailable'}}):json({available:true,bound:state.bound})
      if(path.match(/^\/api\/me\/wallets\/wallet-[ab]\/entries$/)){const second=path.includes('wallet-b');return json({items:[{id:'entry-'+second,kind:'OPENING',deltaFen:second?10020:392801,balanceAfterFen:second?10020:392801,businessAt:date}],total:1})}
      if(path.match(/^\/api\/me\/wallets\/ku52-source-[abcd]\/entries$/))return json({items:[],total:0,readOnlySource:true})
      unknown.push(method+' '+path);return route.fulfill({status:404,headers,json:{message:'Unmocked request blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+path);return route.abort()}
    const p=resolve(dist,'.'+path);assert(p===dist||p.startsWith(dist+sep));const file=extname(p)?p:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();if(fakeClock)await page.clock.install();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/#/pages/'+pageName+'/index');await page.locator('.'+pageName+'-page').waitFor()
  return {page,context,state}
}
try{
  for(const locale of ['zh','en','ja'])for(const width of [320,390]){
    const {page,context,state}=await fixture(locale,width,{source:true})
    try{
      await page.locator('.wallet-account').nth(3).waitFor()
      assert.equal(await page.locator('.wallet-account').count(),4)
      assert.match(await page.locator('.wallet-account').nth(0).innerText(),/6018\.00/)
      assert.match(await page.locator('.wallet-account').nth(1).innerText(),/1533\.00/)
      await page.getByText('TEST-CARD-A',{exact:false}).waitFor()
      await page.locator('.member-sync-status').filter({hasText:tr('历史消费仍在补充，未显示不代表没有消费。',locale)}).waitFor()
      const row=await page.locator('.customer-heading-top').boundingBox(),language=await page.locator('.customer-heading-top .language-switcher').boundingBox()
      assert(language&&language.y>=row.y-1&&language.y+language.height<=row.y+row.height+1,'Language control stays inside its heading row')
      assert(row.y<50,'No extra blank toolbar above the page heading')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      assert(!state.calls.some(call=>call.includes('/wallet-service')))
      await page.screenshot({path:resolve(output,`source-cards-${locale}-${width}.png`)})
      checks.push(`${locale}/${width}: four source cards, separate card numbers and 6018/1533 balances; inline language control; incomplete-history status`)
    }finally{await context.close()}
  }
  for(const locale of ['zh','en','ja'])for(const width of [320,390,414]){
    const {page,context,state}=await fixture(locale,width)
    try{
      await page.locator('.wallet-account').nth(1).waitFor()
      assert.equal(await page.locator('.wallet-account').count(),2)
      assert.match(await page.locator('.wallet-account').first().innerText(),/3928\.01/)
      await page.locator('.wallet-migration-note').filter({hasText:tr('当前仅显示已迁入并核对的账户，其他账户请联系门店核实。',locale)}).waitFor()
      await page.locator('.wallet-account').nth(1).click();await page.locator('.wallet-entry').filter({hasText:'100.20'}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      const header=await page.locator('.wallet-header').boundingBox()
      assert(!state.calls.some(call=>call.includes('/wallet-service')),'Viewing a balance must not depend on an official account')
      assert.equal(await page.locator('.wallet-command').count(),0)
      const scroll=page.locator('.wallet-scroll .taro-scroll-view').first();if(await scroll.count())await scroll.evaluate(node=>node.scrollTop=node.scrollHeight)
      await page.locator('.wallet-service-toggle').click()
      await page.getByText(tr('生成绑定口令',locale),{exact:true}).click();await page.getByText('绑定 ABCDEFGH2345',{exact:true}).waitFor();assert.equal(state.issues,1)
      state.bound=true;await page.getByText(tr('已发送口令，刷新绑定状态',locale),{exact:true}).click();await page.locator('.wallet-bound').waitFor();assert.equal(await page.locator('.wallet-command').count(),0)
      assert(Math.abs((await page.locator('.wallet-header').boundingBox()).y-header.y)<1,'Only the central area scrolls')
      await page.screenshot({path:resolve(output,`${locale}-${width}.png`)})
      checks.push(`${locale}/${width}: separate branch balances, ledger selection, fixed header, one-time binding and refresh fit the screen`)
    }finally{await context.close()}
  }
  for(const mode of ['unverified','empty','membership-pending','zero','guest']){
    const {page,context,state}=await fixture('zh',390,{verified:mode!=='unverified',empty:['empty','membership-pending'].includes(mode),member:mode!=='membership-pending',zero:mode==='zero',signedIn:mode!=='guest'})
    try{
      if(mode==='unverified'){await page.getByText('先验证您的手机号',{exact:true}).waitFor();assert(!state.calls.some(call=>call.includes('/wallet')))}
      if(['empty','membership-pending'].includes(mode)){
        await page.getByText(mode==='empty'?'余额待迁移核对':'会员资料待核实',{exact:true}).waitFor();assert.equal(await page.locator('.wallet-account').count(),0)
        await page.getByText('账户迁入后可直接查询，无需重新绑定服务号。',{exact:true}).waitFor()
        if(mode==='membership-pending')assert.match(await page.locator('.wallet-empty').innerText(),/不代表非会员或余额为零/)
        // Linking is useful before a balance has migrated, too.
        await page.locator('.wallet-service-toggle').click()
        await page.getByText('生成绑定口令',{exact:true}).click();await page.getByText('绑定 ABCDEFGH2345',{exact:true}).waitFor();assert.equal(state.issues,1)
      }
      if(mode==='zero'){await page.locator('.wallet-amount').waitFor();assert.match(await page.locator('.wallet-amount').innerText(),/0\.00/);assert.equal(await page.locator('.wallet-empty').count(),0)}
      if(mode==='guest'){await page.locator('.login-hero-submit').waitFor();assert(!state.calls.some(call=>call.includes('/api/me/')))}
      await page.screenshot({path:resolve(output,mode+'.png')});checks.push(`${mode}: no fabricated balance or unauthorised data query`)
    }finally{await context.close()}
  }
  {
    const {page,context,state}=await fixture('zh',390,{fakeClock:true})
    try{
      await page.locator('.wallet-amount').first().filter({hasText:'3928.01'}).waitFor()
      state.accounts[0].balanceFen=382801;state.accounts[0].version++
      await page.clock.fastForward(16_000)
      await page.locator('.wallet-amount').first().filter({hasText:'3828.01'}).waitFor()
      checks.push('visible wallet: a backend change appears automatically within the 15-second refresh cycle')
      state.serviceFail=true
      await page.locator('.wallet-service-toggle').click();await page.locator('.wallet-service-error').waitFor()
      assert.match(await page.locator('.wallet-amount').first().innerText(),/3828\.01/)
      assert.equal(await page.locator('.wallet-balance-error').count(),0)
      checks.push('official-account API failure does not hide or invalidate direct balances')
      state.walletFail=true
      await page.getByText('刷新余额',{exact:true}).click();await page.locator('.wallet-balance-error').filter({hasText:'上次查询结果'}).waitFor()
      assert.match(await page.locator('.wallet-amount').first().innerText(),/3828\.01/)
      state.walletFail=false;state.accounts[0].balanceFen=372801;state.accounts[0].version++
      await page.clock.fastForward(16_000);await page.locator('.wallet-amount').first().filter({hasText:'3728.01'}).waitFor()
      assert.equal(await page.locator('.wallet-balance-error').count(),0)
      checks.push('a failed balance refresh labels the last result and recovers automatically without fabricating zero')
      await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))})
      const before=state.calls.filter(call=>call==='GET /api/me/wallets').length
      state.accounts[0].balanceFen=362801;state.accounts[0].version++
      await page.clock.fastForward(32_000)
      assert.equal(state.calls.filter(call=>call==='GET /api/me/wallets').length,before)
      await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))})
      await page.locator('.wallet-amount').first().filter({hasText:'3628.01'}).waitFor()
      checks.push('hidden page stops balance requests; returning immediately fetches the latest balance')
      await page.screenshot({path:resolve(output,'live-wallet.png')})
    }finally{await context.close()}
  }
  {
    const {page,context,state}=await fixture('zh',390,{empty:true,fakeClock:true})
    try{
      await page.getByText('余额待迁移核对',{exact:true}).waitFor();state.empty=false
      await page.clock.fastForward(16_000);await page.locator('.wallet-amount').first().filter({hasText:'3928.01'}).waitFor()
      assert(!state.calls.some(call=>call.includes('/wallet-service')))
      checks.push('newly migrated accounts appear automatically without service binding or relogin')
    }finally{await context.close()}
  }
  for(const locale of ['zh','en','ja']){
    const {page,context,state}=await fixture(locale,320,{pageName:'orders',fakeClock:true})
    try{
      await page.locator('.balance-summary-amount').filter({hasText:'4028.21'}).waitFor()
      assert(!state.calls.some(call=>call.includes('/wallet-service')))
      state.accounts[0].balanceFen=382801;state.accounts[0].version++
      await page.clock.fastForward(16_000);await page.locator('.balance-summary-amount').filter({hasText:'3928.21'}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true)
      await assertFullText(page.locator('.page').filter({visible:true}).last(),'Translated member page')
      await page.screenshot({path:resolve(output,`summary-${locale}-320.png`)})
      await page.locator('.balance-summary-detail:not(.balance-summary-consumption)').click();await page.locator('.wallet-amount').first().filter({hasText:'3828.01'}).waitFor()
      const before=state.calls.filter(call=>call==='GET /api/me/wallets').length
      await page.clock.fastForward(16_000)
      await page.locator('.wallet-refresh').filter({hasText:tr('刷新余额',locale)}).waitFor()
      assert.equal(state.calls.filter(call=>call==='GET /api/me/wallets').length,before+1,'Hidden orders must not keep polling alongside the wallet page')
      checks.push(`${locale}/320: My appointments shows live migrated totals and opens details directly; hidden summaries stop polling`)
    }finally{await context.close()}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  const report={status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realMessagesSent:false,checks,errors,unknown}
  await writeFile(resolve(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}finally{await browser.close()}
