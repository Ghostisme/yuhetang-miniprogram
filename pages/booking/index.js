const api=require('../../utils/api')
Page({
  data:{site:null,step:0,steps:['门店','项目','时段','信息'],storeId:'',serviceId:'',store:null,service:null,services:[],date:api.day(1),today:api.day(),lastDay:api.day(7),slots:[],startTime:'',headcount:1,counts:[1,2,3,4],teachers:[],teacherNames:['门店安排（不指定）'],teacherIndex:0,teachersLoading:false,name:'',phone:'',memberIndex:2,visitedIndex:2,claimNames:['是','否','不确定'],remark:'',privacyConsent:false,sensitiveConsent:false,rules:null,runtime:{},receipt:null,key:'',busy:false,error:''},
  async onLoad(options){this.setData({storeId:options.storeId||'',serviceId:options.serviceId||'',key:api.id()});try{const [site,runtime]=await Promise.all([getApp().loadSite(),api.request('/api/runtime')]);this.setData({site,runtime});if(this.data.storeId)this.selectStoreId(this.data.storeId);api.login().catch(()=>{})}catch(e){this.setData({error:e.message})}},
  selectStoreId(id){const store=this.data.site.stores.find(s=>s.id===id&&s.onlineBooking);if(!store)return;const services=this.data.site.services.filter(s=>s.enabled&&!(store.disabledServiceIds||[]).includes(s.id));this.setData({storeId:id,store,services,startTime:'',teacherIndex:0,teachers:[],teacherNames:['门店安排（不指定）'],serviceId:services.some(s=>s.id===this.data.serviceId)?this.data.serviceId:'',key:api.id(),error:''});this.loadSlots();this.loadTeachers()},
  store(e){this.selectStoreId(e.currentTarget.dataset.id)},
  service(e){this.setData({serviceId:e.currentTarget.dataset.id,key:api.id()});this.loadTeachers()},
  async loadSlots(){
    const {storeId,date}=this.data,request=(this.slotsRequest||0)+1;this.slotsRequest=request
    this.setData({slots:[]})
    if(!storeId)return
    try{
      const result=await api.request('/api/stores/'+storeId+'/slots?date='+date)
      if(request!==this.slotsRequest||storeId!==this.data.storeId||date!==this.data.date)return
      this.setData({slots:result.slots,rules:result.rules,lastDay:api.day(result.rules.advanceDays),counts:Array.from({length:result.rules.maxHeadcount},(_,i)=>i+1),error:''})
    }catch(e){if(request===this.slotsRequest)this.setData({slots:[],error:e.message})}
  },
  async loadTeachers(){
    const {storeId,serviceId}=this.data,request=(this.teachersRequest||0)+1;this.teachersRequest=request
    this.setData({teachers:[],teacherNames:['门店安排（不指定）'],teacherIndex:0,teachersLoading:!!(storeId&&serviceId)})
    if(!storeId||!serviceId)return
    try{
      const result=api.media(await api.request('/api/stores/'+storeId+'/therapists'))
      if(request!==this.teachersRequest||storeId!==this.data.storeId||serviceId!==this.data.serviceId)return
      const teachers=result.filter(t=>t.storeId===storeId&&t.enabled&&!t.resting&&t.serviceIds.includes(serviceId))
      this.setData({teachers,teacherNames:['门店安排（不指定）',...teachers.map(t=>t.name+' · '+t.grade+' · '+t.storeName)]})
    }catch(e){if(request===this.teachersRequest)this.setData({error:e.message})}
    finally{if(request===this.teachersRequest)this.setData({teachersLoading:false})}
  },
  onUnload(){this.slotsRequest=(this.slotsRequest||0)+1;this.teachersRequest=(this.teachersRequest||0)+1},
  async next(){const d=this.data;if(d.step===0&&!d.storeId)return api.error(new Error('请选择到店门店。'));if(d.step===1&&!d.serviceId)return api.error(new Error('请选择养护项目。'));if(d.step===2&&!d.startTime)return api.error(new Error('请选择可用时段。'));this.setData({step:Math.min(3,d.step+1),service:d.site.services.find(s=>s.id===d.serviceId),error:''});if(d.step===2)this.loadSlots();wx.pageScrollTo({scrollTop:0,duration:150})},
  step(e){const step=Number(e.currentTarget.dataset.step);if(step<this.data.step)this.setData({step})},
  prev(){this.setData({step:Math.max(0,this.data.step-1)})},
  date(e){this.setData({date:e.detail.value,startTime:'',key:api.id()});this.loadSlots()},
  count(e){this.setData({headcount:Number(e.detail.value)+1,startTime:'',key:api.id()})},
  slot(e){this.setData({startTime:e.currentTarget.dataset.time,key:api.id()})},
  input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value,key:api.id()})},
  select(e){this.setData({[e.currentTarget.dataset.field]:Number(e.detail.value),key:api.id()})},
  agree(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value.length>0,key:api.id()})},
  privacy(){wx.showModal({title:'预约隐私说明',content:'我们收集您的称呼、联系电话、到店时间、人数及服务意向，用于本次门店接待、确认与必要通知。会员选项为自述，需门店核实。门店不会仅凭手机号向他人开放您的微信预约记录。请勿填写身份证、病历等不必要资料；如自愿提供健康信息，请单独勾选同意。您可通过微信客服联系门店更正、删除资料；完整处理规则以小程序隐私保护指引为准。',showCancel:false})},
  // 订阅接口保持在点击处理入口，避免失去微信要求的用户触发上下文。
  async submit(){if(this.data.busy)return;const d=this.data;if(d.teachersLoading)return api.error(new Error('正在加载本店调理师，请稍候。'));const chosen=d.teacherIndex?d.teachers[d.teacherIndex-1]:null;if(d.teacherIndex&&(!chosen||chosen.storeId!==d.storeId))return api.error(new Error('请重新选择本店调理师。'));if(!d.name.trim()||!/^1[3-9]\d{9}$/.test(d.phone))return api.error(new Error('请填写称呼和正确的11位手机号。'));if(!d.privacyConsent)return api.error(new Error('请阅读并同意预约隐私说明。'));this.setData({busy:true,error:''});try{const subscription=wx.getStorageSync('yht-token')?api.subscribe(d.runtime.customerTemplateId):Promise.resolve();await api.login();await subscription;await api.privacy();const claims=['YES','NO','UNKNOWN'];const receipt=await api.request('/api/appointments',{method:'POST',headers:{'Idempotency-Key':d.key},data:{storeId:d.storeId,serviceId:d.serviceId,date:d.date,startTime:d.startTime,headcount:d.headcount,name:d.name,phone:d.phone,therapistIntentId:chosen?chosen.id:'',memberClaim:claims[d.memberIndex],visitedClaim:claims[d.visitedIndex],remark:d.remark,privacyConsent:true,sensitiveConsent:d.sensitiveConsent}});this.setData({receipt});wx.pageScrollTo({scrollTop:0,duration:150})}catch(e){this.setData({error:e.message});api.error(e);this.loadSlots()}finally{this.setData({busy:false})}},
  orders(){wx.switchTab({url:'/pages/orders/index'})},
  call(){api.call(this.data.store.phone)}
})
