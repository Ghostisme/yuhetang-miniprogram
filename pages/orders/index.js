const api=require('../../utils/api')
Page({
  data:{orders:[],themeStyle:'',error:'',loading:false,editing:'',date:api.day(1),today:api.day(),lastDay:api.day(7),times:[],timeIndex:0,busy:false,runtime:{}},
  onShow(){this.load();this.timer=setInterval(()=>this.load(true),10000)},
  onHide(){clearInterval(this.timer);this.timesRequest=(this.timesRequest||0)+1;this.setData({editing:'',times:[]})},onUnload(){clearInterval(this.timer);this.timesRequest=(this.timesRequest||0)+1},onPullDownRefresh(){this.load()},
  async load(quiet=false){if(!quiet)this.setData({loading:true});try{await api.login();const [orders,runtime,site]=await Promise.all([api.request('/api/me/appointments'),api.request('/api/runtime'),getApp().loadSite()]);this.setData({orders,runtime,themeStyle:site.themeStyle,error:''})}catch(e){if(!quiet)this.setData({error:e.message})}finally{this.setData({loading:false});wx.stopPullDownRefresh()}},
  async cancel(e){const b=this.data.orders.find(b=>b.id===e.currentTarget.dataset.id);wx.showModal({title:'取消到店申请',content:'取消后将释放本次预约名额。确定取消吗？',confirmText:'确定取消',success:async r=>{if(!r.confirm)return;try{await api.request('/api/me/appointments/'+b.id,{method:'PATCH',data:{action:'cancel',version:b.version,note:'客户取消预约'}});this.load()}catch(err){api.error(err);this.load()}}})},
  async edit(e){const b=this.data.orders.find(b=>b.id===e.currentTarget.dataset.id);this.setData({editing:b.id,date:b.bookingDate,times:[],timeIndex:0});this.loadTimes()},
  async loadTimes(){
    const b=this.data.orders.find(b=>b.id===this.data.editing),date=this.data.date,request=(this.timesRequest||0)+1;this.timesRequest=request;this.setData({times:[],timeIndex:0});if(!b)return
    try{const r=await api.request('/api/me/appointments/'+b.id+'/slots?date='+date);if(request!==this.timesRequest||b.id!==this.data.editing||date!==this.data.date)return;this.setData({times:r.slots.filter(s=>s.available&&s.remaining>=b.headcount).map(s=>s.time),lastDay:api.day(r.rules.advanceDays),timeIndex:0})}catch(e){if(request===this.timesRequest){api.error(e);this.setData({times:[]})}}
  },
  date(e){this.setData({date:e.detail.value,times:[],timeIndex:0});this.loadTimes()},time(e){this.setData({timeIndex:Number(e.detail.value)})},close(){this.timesRequest=(this.timesRequest||0)+1;this.setData({editing:'',times:[]})},
  async save(){if(this.data.busy)return;const b=this.data.orders.find(b=>b.id===this.data.editing),startTime=this.data.times[this.data.timeIndex],date=this.data.date;if(!b||!startTime)return api.error(new Error('请先选择可用时间。'));this.setData({busy:true});try{const subscription=api.subscribe(this.data.runtime.customerTemplateId);await subscription;await api.request('/api/me/appointments/'+b.id,{method:'PATCH',data:{action:'reschedule',version:b.version,date,startTime}});this.close();this.load();wx.showModal({title:'改约申请已提交',content:'新的到店时间需要门店重新人工确认。请以确认结果为准。',showCancel:false})}catch(e){api.error(e);this.load()}finally{this.setData({busy:false})}},
  async notify(){await api.subscribe(this.data.runtime.customerTemplateId);wx.showToast({title:'订阅选择已处理',icon:'none'})},
  book(){wx.navigateTo({url:'/pages/booking/index'})},
  async call(e){try{const site=getApp().globalData.site||await getApp().loadSite();api.call(site.stores.find(s=>s.id===e.currentTarget.dataset.store).phone)}catch(err){api.error(err)}}
})
