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
async function fixture(profile={...fresh}){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});contexts.push(context)
  const state={profile:{...profile},calls:[],saves:[]}
  await context.addInitScript(()=>{
    if(location.origin!=='http://127.0.0.1:5182')return
    localStorage.setItem('yht-session-context',JSON.stringify({data:'https://mp-admin.hetuonian.cn|wechat'}))
    localStorage.setItem('yht-token',JSON.stringify({data:'customer-profile-fixture'}))
    localStorage.setItem('yht-login-consent',JSON.stringify({data:JSON.stringify({version:'2026-11-08'})}))
  })
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===apiOrigin&&url.pathname.startsWith('/api/')){
      const path=url.pathname,headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,idempotency-key','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'}
      const json=data=>route.fulfill({headers,json:data})
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      state.calls.push({path,method:req.method()})
      if(path==='/api/site')return json({brandName:'裕和堂',brandEnglish:'YU HE TANG',theme:'sage',hero:{},contact:{},stores:[store],services:[],sections:[],products:[],galleryGroups:[]})
      if(path==='/api/runtime')return json({customerProfiles:true,developmentLogin:false,customerTemplateIds:[]})
      if(path.startsWith('/api/me/'))assert.equal(req.headers().authorization,'Bearer customer-profile-fixture')
      if(path==='/api/me/profile'&&req.method()==='GET')return json(state.profile)
      if(path==='/api/me/profile'&&req.method()==='PUT'){
        const body=req.postDataJSON();assert.deepEqual(Object.keys(body).sort(),['consent','name']);assert.equal(body.consent,true)
        state.saves.push(body);state.profile={...state.profile,name:body.name};return json(state.profile)
      }
      if(path==='/api/me/appointments')return json([])
      if(path==='/api/me/subscriptions')return json({templates:[],items:[],development:false})
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
try{
  const pending=await fixture();await visit(pending.page,'/pages/orders/index')
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
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',liveApisUsed:false,checks,errors,unknown,nativePhoneAuthorization:'requires real WeChat device; provider exchange is covered by Java tests'},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
}finally{for(const context of contexts)await context.close();await browser.close()}
