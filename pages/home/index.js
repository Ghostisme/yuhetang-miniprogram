const api = require('../../utils/api')
Page({
  data: {site:null, error:'', services:[], stores:[], products:[]},
  onShow() {this.load()},
  async load() {try {const site=await getApp().loadSite();this.setData({site,services:site.services.filter(s=>s.enabled).slice(0,4),stores:site.stores.slice(0,2),products:site.products.filter(p=>p.enabled).slice(0,2),error:''})}catch(e){this.setData({error:e.message})}finally{wx.stopPullDownRefresh()}},
  onPullDownRefresh() {this.load()},
  book(e) {wx.navigateTo({url:'/pages/booking/index?'+(e.currentTarget.dataset.service?'serviceId='+e.currentTarget.dataset.service:'')})},
  catalog() {wx.switchTab({url:'/pages/catalog/index'})},
  stores() {wx.switchTab({url:'/pages/stores/index'})},
  orders() {wx.switchTab({url:'/pages/orders/index'})},
  products() {getApp().globalData.catalogTab='products';this.catalog()},
  story() {getApp().globalData.catalogTab='brand';this.catalog()},
  hasSection(id) {return this.data.site.sections.some(s=>s.id===id&&s.enabled)},
  onShareAppMessage() {return {title:'裕和堂 · 留一段时间，好好照顾自己',path:'/pages/home/index'}}
})
