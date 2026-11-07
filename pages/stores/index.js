const api=require('../../utils/api')
Page({
  data:{site:null,stores:[],districts:[],district:'全部',selected:null,error:''},
  async onShow(){try{const site=await getApp().loadSite();this.setData({site,selected:this.data.selected?site.stores.find(s=>s.id===this.data.selected.id)||null:null,districts:['全部',...new Set(site.stores.map(s=>s.district))],error:''});this.filter()}catch(e){this.setData({error:e.message})}},
  filter(){this.setData({stores:this.data.site.stores.filter(s=>this.data.district==='全部'||s.district===this.data.district)})},
  district(e){this.setData({district:e.currentTarget.dataset.district});this.filter()},
  detail(e){this.setData({selected:this.data.site.stores.find(s=>s.id===e.currentTarget.dataset.id)})},
  back(){this.setData({selected:null})},
  book(e){const s=this.data.site.stores.find(s=>s.id===e.currentTarget.dataset.id);if(s.onlineBooking)wx.navigateTo({url:'/pages/booking/index?storeId='+s.id+'&serviceId='+encodeURIComponent(e.currentTarget.dataset.service||'')});else api.call(s.phone)},
  call(){api.call(this.data.selected.phone)},
  map(){const s=this.data.selected;if(!s.latitude||!s.longitude)return wx.showToast({title:'门店导航资料待完善，请联系客服',icon:'none'});wx.openLocation({latitude:Number(s.latitude),longitude:Number(s.longitude),name:s.name,address:s.address,scale:17})},
  preview(e){wx.previewImage({current:e.currentTarget.dataset.url,urls:this.data.selected.gallery})},
  contact(e){api.contact(this.data.selected?this.data.selected.id:'')}
})
