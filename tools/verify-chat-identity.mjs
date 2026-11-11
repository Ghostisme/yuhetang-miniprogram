import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,sep,extname} from 'node:path'
import {createHash} from 'node:crypto'

// Actual compiled H5 screens with isolated, authenticated API fixtures. No real WeChat sends.
const origin='http://127.0.0.1:5182',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5')
const output=resolve('backups/chat-identity-verification');await mkdir(output,{recursive:true})
const browser=await chromium.launch({channel:'msedge',headless:true}),contexts=[],checks=[],errors=[],unknown=[]
const fresh={name:'',phone:'',phoneVerified:false,memberVerified:false,memberGrade:'',sources:['MINIPROGRAM'],complete:false}
const authorized={...fresh,name:'陈女士',phone:'13900003001',phoneVerified:true,complete:true}
async function fixture({signedIn=true,profile=fresh,failProfile=false,width=390,height=844}={}){
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});contexts.push(context)
  const state={profile:{...profile},failProfile,calls:[]}
  if(signedIn)await context.addInitScript(()=>{
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    localStorage.setItem('yht-token',JSON.stringify({data:'chat-identity-fixture'}))
    localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
  })
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===api&&url.pathname.startsWith('/api/')){
      const path=url.pathname,headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'}
      const json=(data,status=200)=>route.fulfill({headers,status,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push({path,method:req.method()})
      if(path==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',hero:{},contact:{phone:'021-50000000'},stores:[{id:'shanghai',name:'上海中心店',enabled:true,phone:'021-50181919'}],services:[],sections:[],products:[],galleryGroups:[]})
      if(path==='/api/runtime')return json({developmentLogin:false})
      assert(signedIn,'Guest must not make private requests');assert.equal(req.headers().authorization,'Bearer chat-identity-fixture')
      if(path==='/api/me/profile'&&req.method()==='GET')return state.failProfile?json({message:'测试：资料服务暂时不可用'},503):json(state.profile)
      if(path==='/api/me/profile'&&req.method()==='PUT'){
        const body=req.postDataJSON();assert.equal(body.consent,true);assert(!('phone' in body),'A typed phone cannot masquerade as WeChat phone authorization')
        state.profile={...state.profile,name:body.name,complete:!!state.profile.phoneVerified&&!!body.name.trim()&&body.consent===true};return json(state.profile)
      }
      if(path==='/api/me/chats'&&req.method()==='POST'){
        assert(state.profile.complete&&state.profile.phoneVerified,'No anonymous chat creation')
        assert.deepEqual(req.postDataJSON(),{storeId:'shanghai'});return json({id:'identified',status:'OPEN'})
      }
      if(path==='/api/me/chats/identified/messages'&&req.method()==='GET')return json({items:[],conversation:{id:'identified',status:'OPEN'}})
      unknown.push(req.method()+' '+path);return json({message:'Unmocked API blocked'},404)
    }
    if(url.origin!==origin){unknown.push(url.origin+url.pathname);return route.abort()}
    const path=resolve(dist,'.'+url.pathname);assert(path===dist||path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return {page,state}
}
async function visit(page,native=false){await page.goto(origin+'/#/pages/chat/index?storeId=shanghai'+(native?'&channel=wechat':''))}
function noChat(state){assert.equal(state.calls.filter(c=>c.path.startsWith('/api/me/chat')).length,0)}
try{
  const guest=await fixture({signedIn:false});await visit(guest.page);await guest.page.locator('.chat-login-card').waitFor()
  noChat(guest.state);assert.equal(guest.state.calls.some(c=>c.path==='/api/me/profile'),false)
  assert.equal(await guest.page.locator('.chat-compose').count(),0)
  await guest.page.locator('.contact-entry').click();await guest.page.locator('.contact-phone').waitFor()
  checks.push('Guest sees explicit login and keeps a branch telephone option; no private request or conversation is created')

  for(const width of [320,390,414]){
    const f=await fixture({width,height:width===320?568:844});await visit(f.page)
    const card=f.page.locator('.customer-profile-card');await card.locator('input[placeholder="请输入您的姓名或称呼"]').waitFor()
    assert.equal(await f.page.locator('.chat-compose').count(),0);noChat(f.state)
    await card.locator('input[placeholder="请输入您的姓名或称呼"]').fill('王女士')
    await card.locator('.profile-consent').click()
    assert.equal(await card.getByText('保存称呼',{exact:true}).count(),0)
    await card.getByText('请在手机微信中打开小程序并授权手机号后，再使用客服对话。',{exact:true}).waitFor()
    assert.equal(f.state.calls.some(c=>c.method==='PUT'||c.method==='POST'),false)
    assert.equal(f.state.profile.phoneVerified,false)
    noChat(f.state);assert.equal(await f.page.locator('.chat-compose').count(),0)
    assert(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
    const footer=await f.page.locator('.chat-contact-footer').boundingBox();assert(footer&&footer.y+footer.height<=f.page.viewportSize().height+1)
    const scroll=f.page.locator('.chat-profile-scroll');assert(await scroll.count());await f.page.screenshot({path:resolve(output,`profile-required-${width}.png`)})
    // The phone grant itself is native WeChat UI. Here the server fixture returns its completed result on re-entry.
    f.state.profile={...authorized,name:'王女士'};await f.page.reload();await f.page.getByText('等待门店接入，您可以先留下问题。',{exact:true}).waitFor()
    assert.equal(f.state.calls.filter(c=>c.path==='/api/me/chats').length,1)
    assert.equal(await f.page.locator('.chat-profile-gate').count(),0)
    checks.push(`${width}px: name and consent alone never unlock chat; verified server profile unlocks one branch conversation; form scrolls within the page`)
  }
  const native=await fixture({profile:{...fresh,name:'仅有姓名的客户'}});await visit(native.page,true)
  await native.page.locator('.chat-profile-gate .profile-card-form').waitFor()
  noChat(native.state);assert.equal(await native.page.locator('.chat-compose').count(),0)
  assert.equal(await native.page.getByText('保存称呼',{exact:true}).count(),0)
  checks.push('The WeChat contact route also requires phone authorization, even when the customer already saved a name')

  const partial=await fixture({profile:{...fresh,phone:'13900003001',phoneVerified:true}});await visit(partial.page)
  const partialCard=partial.page.locator('.customer-profile-card')
  await partialCard.locator('input[placeholder="请输入您的姓名或称呼"]').fill('陈女士')
  await partialCard.getByText('保存资料并开始咨询',{exact:true}).click()
  await partialCard.getByText('请先同意将资料用于客户档案与预约联系。',{exact:true}).waitFor();noChat(partial.state)
  await partialCard.locator('.profile-consent').click()
  await partialCard.getByText('保存资料并开始咨询',{exact:true}).click()
  await partial.page.getByText('等待门店接入，您可以先留下问题。',{exact:true}).waitFor()
  assert.equal(partial.state.calls.filter(c=>c.path==='/api/me/profile'&&c.method==='PUT').length,1)
  assert.equal(partial.state.calls.filter(c=>c.path==='/api/me/chats').length,1)
  checks.push('An existing verified phone needs only the missing name and consent; saving resumes the conversation without a second phone grant')
  const failed=await fixture({profile:authorized,failProfile:true});await visit(failed.page)
  await failed.page.locator('.chat-error').filter({hasText:'测试：资料服务暂时不可用'}).waitFor();noChat(failed.state)
  assert.equal(await failed.page.locator('.chat-compose').count(),0)
  failed.state.failProfile=false;await failed.page.waitForTimeout(3100);await failed.page.getByText('重新加载',{exact:true}).click();await failed.page.getByText('等待门店接入，您可以先留下问题。',{exact:true}).waitFor()
  assert.equal(failed.state.calls.filter(c=>c.path==='/api/me/chats').length,1)
  checks.push('Profile lookup failure keeps chat closed; explicit retry restores access after verified lookup')
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),builtIndexSha256:createHash('sha256').update(await readFile(resolve(dist,'index.html'))).digest('hex'),checks,errors,unknown,liveApisUsed:false,realMessagesSent:false,nativePhoneGrantRequiresDevice:true},null,2))
  console.log(JSON.stringify({status:'passed',cases:checks.length,output},null,2))
}catch(error){for(const [i,c] of contexts.entries())await c.pages()[0]?.screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true});console.error({errors,unknown});throw error}
finally{for(const c of contexts)await c.close();await browser.close()}
