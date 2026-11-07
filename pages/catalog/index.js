const api=require('../../utils/api')
Page({
  data:{site:null,tab:'services',selected:null,items:[],error:''},
  async onShow(){try{const site=await getApp().loadSite(), tab=getApp().globalData.catalogTab||this.data.tab;getApp().globalData.catalogTab='';this.setData({site,tab,selected:null,error:''});this.updateItems()}catch(e){this.setData({error:e.message})}},
  updateItems(){const {site,tab}=this.data;this.setData({items:tab==='services'?site.services.filter(s=>s.enabled):tab==='products'?site.products.filter(p=>p.enabled):[]})},
  tab(e){this.setData({tab:e.currentTarget.dataset.tab,selected:null});this.updateItems()},
  detail(e){const selected=this.data.items.find(s=>s.id===e.currentTarget.dataset.id);this.setData({selected})},
  back(){this.setData({selected:null})},
  book(){wx.navigateTo({url:'/pages/booking/index?serviceId='+this.data.selected.id})},
  preview(e){const url=e.currentTarget.dataset.url;wx.previewImage({current:url,urls:e.currentTarget.dataset.urls||[url]})},
  contact(e){api.contact('')}
})
