const api = require('./utils/api')
App({
  globalData: {site: null},
  async loadSite() {
    const site = api.media(await api.request('/api/site'))
    const theme=site.theme==='sand'?{ink:'#5b4937',primary:'#7a654c',paper:'#fbf7f0',soft:'#f0e8dc'}:site.theme==='ink'?{ink:'#35434a',primary:'#3e535c',paper:'#f7f8f8',soft:'#e7ecee'}:{ink:'#344a3b',primary:'#435e4b',paper:'#faf9f3',soft:'#e9eddf'}
    site.themeStyle=`--ink:${theme.ink};--primary:${theme.primary};--paper:${theme.paper};--soft:${theme.soft};`
    wx.setNavigationBarColor({frontColor:'#000000',backgroundColor:theme.paper})
    wx.setTabBarStyle({selectedColor:theme.primary,backgroundColor:theme.paper})
    this.globalData.site = site
    return site
  }
})
