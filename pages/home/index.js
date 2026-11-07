const api = require('../../utils/api')
Page({
  data: {site:null, error:'', services:[], stores:[], products:[]},
  onShow() {this.load()},
  async load(force=false) {try {const site=await getApp().loadSite(force);this.setData({site,services:site.services.filter(s=>s.enabled).slice(0,4),stores:site.stores.slice(0,2),products:site.products.filter(p=>p.enabled).slice(0,2),error:''})}catch(e){this.setData({error:e.message})}finally{wx.stopPullDownRefresh()}},
  onPullDownRefresh() {return this.load(true)},
  book(e) {wx.navigateTo({url:'/pages/booking/index?'+(e.currentTarget.dataset.service?'serviceId='+e.currentTarget.dataset.service:'')})},
  catalog() {wx.switchTab({url:'/pages/catalog/index'})},
  stores() {wx.switchTab({url:'/pages/stores/index'})},
  orders() {wx.switchTab({url:'/pages/orders/index'})},
  products() {getApp().globalData.catalogTab='products';this.catalog()},
  story() {getApp().globalData.catalogTab='brand';this.catalog()},
  hasSection(id) {return this.data.site.sections.some(s=>s.id===id&&s.enabled)},
  onShareAppMessage() {const site=this.data.site||{};return {title:[site.brandName||'裕和堂',site.tagline].filter(Boolean).join(' · '),path:'/pages/home/index'}},
  contact(e){api.contact('')}
})
