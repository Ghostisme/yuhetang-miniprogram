import assert from 'node:assert/strict'
import {chromium} from 'playwright'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {resolve, sep, extname} from 'node:path'

// Exercise the real H5 preview overlay and tab resumes; all HTTP uses fixtures.
const origin='http://127.0.0.1:5182',api='https://mp-admin.hetuonian.cn',dist=resolve('dist/h5'),output=resolve('backups/gallery-preview')
const checks=[],errors=[],unknown=[],contexts=[]
await mkdir(output,{recursive:true})
const image=await readFile(resolve('src/assets/login/reception.jpg'))
const care={id:'care',name:'舒缓养护',enabled:true,image:origin+'/fixture/care.jpg',subtitle:'自在时光',description:'养护介绍',steps:[]}
const site={brandName:'裕和堂',brandEnglish:'YU Health',theme:'sage',tagline:'自在有和',hero:{image:origin+'/fixture/hero.jpg',title:'一段自在时光',button:'预约'},brandStory:'品牌介绍',contact:{},stores:[],services:[care],products:[{...care,id:'product',name:'草本茶饮'}],sections:[{id:'brand',enabled:true}],galleryGroups:[{id:'tea',name:'茶室光影',images:Array.from({length:10},(_,i)=>origin+`/fixture/tea-${i}.jpg`)},{id:'room',name:'静养空间',images:Array.from({length:6},(_,i)=>origin+`/fixture/room-${i}.jpg`)}]}
const browser=await chromium.launch({channel:'msedge',headless:true})
async function fixture(width){
  const context=await browser.newContext({viewport:{width,height:width===320?568:844},isMobile:true,hasTouch:true})
  context.setDefaultTimeout(12000);contexts.push(context)
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url())
    if(url.origin===api&&url.pathname.startsWith('/api/')){
      const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'}
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers})
      if(req.method()==='GET'&&url.pathname==='/api/site')return route.fulfill({headers,json:site})
      if(req.method()==='GET'&&url.pathname==='/api/runtime')return route.fulfill({headers,json:{customerTemplateIds:[],developmentLogin:false}})
      unknown.push(req.method()+' '+url.pathname);return route.fulfill({status:404,headers,json:{message:'Unmocked request blocked'}})
    }
    if(url.origin!==origin){unknown.push(url.origin+url.pathname);return route.abort()}
    if(url.pathname.startsWith('/fixture/'))return route.fulfill({contentType:'image/jpeg',body:image})
    const path=resolve(dist,'.'+url.pathname);assert(path===dist||path.startsWith(dist+sep))
    const file=extname(path)?path:resolve(dist,'index.html')
    return route.fulfill({contentType:{'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[extname(file)]||'application/octet-stream',body:await readFile(file)})
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  return page
}
function active(page){return page.locator('.catalog-page').filter({visible:true})}
try{
  for(const width of [320,390,414]){
    const page=await fixture(width)
    await page.goto(origin+'/#/pages/catalog/index')
    await active(page).getByText('空间美学',{exact:true}).click()
    const target=active(page).locator('.gallery taro-image-core').nth(7)
    await target.scrollIntoViewIfNeeded()
    const before=await target.boundingBox();assert(before)
    const route=page.url()
    for(let i=0;i<2;i++){
      await target.click()
      await page.locator('.preview-image').waitFor()
      assert.equal(await page.locator('.preview-image img').count(),10,'Preview is scoped to its album')
      await page.locator('.preview-image').click({position:{x:8,y:8}})
      await page.locator('.preview-image').waitFor({state:'detached'})
      assert.equal(page.url(),route)
      assert.equal(await active(page).locator('.catalog-tabs .active').innerText(),'空间美学')
      assert.equal(await active(page).locator('.gallery taro-image-core').count(),16)
      const after=await target.boundingBox();assert(after&&Math.abs(after.y-before.y)<2,'Closing preview preserves scroll position')
    }
    await page.screenshot({path:resolve(output,`gallery-return-${width}.png`)})
    // Tab switches cause real page onShow calls and must not reset the sub-column.
    await page.locator('taro-tabbar').getByText('客服',{exact:true}).click()
    await page.locator('.contact-page').filter({visible:true}).waitFor()
    await page.locator('taro-tabbar').getByText('养护',{exact:true}).click()
    assert.equal(await active(page).locator('.catalog-tabs .active').innerText(),'空间美学')
    await page.locator('taro-tabbar').getByText('首页',{exact:true}).click()
    await page.locator('.home-page').filter({visible:true}).locator('.quick-links taro-button-core').filter({hasText:'东方好物'}).click()
    assert.equal(await active(page).locator('.catalog-tabs .active').innerText(),'东方好物')
    await page.locator('taro-tabbar').getByText('首页',{exact:true}).click()
    await page.locator('.home-page').filter({visible:true}).locator('.quick-links taro-button-core').filter({hasText:'特色养护'}).click()
    assert.equal(await active(page).locator('.catalog-tabs .active').innerText(),'特色养护')
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
    checks.push(`${width}px: preview closes to the same album, image and scroll position; repeated previews and tab resumes preserve the column; homepage shortcuts still select their requested columns`)
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unknown,[])
  await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',createdAt:new Date().toISOString(),liveApisUsed:false,realMessagesSent:false,nativeOnShowUnitRegression:'tests/catalog-navigation.test.ts',checks,errors,unknown},null,2)+'\n')
  console.log(JSON.stringify({status:'passed',checks},null,2))
}catch(error){
  for(const [i,context]of contexts.entries())if(context.pages()[0])await context.pages()[0].screenshot({path:resolve(output,`failure-${i}.png`),fullPage:true})
  console.error({errors,unknown});throw error
}finally{for(const context of contexts)await context.close();await browser.close()}
