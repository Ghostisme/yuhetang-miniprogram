const api = require('./utils/api')
App({
  globalData: {site: null, runtime: null},
  async loadRuntime(force=false) {
    if(!force&&this.globalData.runtime&&Date.now()-(this.runtimeLoadedAt||0)<60000)return this.globalData.runtime
    if(this.runtimePromise)return this.runtimePromise
    this.runtimePromise=api.request('/api/runtime').then(runtime=>{
      this.globalData.runtime=runtime
      this.runtimeLoadedAt=Date.now()
      return runtime
    })
    try{return await this.runtimePromise}finally{this.runtimePromise=null}
  },
  async loadSite(force=false) {
    if(!force&&this.globalData.site&&Date.now()-(this.siteLoadedAt||0)<60000)return this.globalData.site
    if(this.sitePromise)return this.sitePromise
    this.sitePromise=this.fetchSite()
    try{return await this.sitePromise}finally{this.sitePromise=null}
  },
  async fetchSite() {
    const site = api.media(await api.request('/api/site'))
    const theme=site.theme==='sand'?{ink:'#5b4937',primary:'#7a654c',paper:'#fbf7f0',soft:'#f0e8dc'}:site.theme==='ink'?{ink:'#35434a',primary:'#3e535c',paper:'#f7f8f8',soft:'#e7ecee'}:{ink:'#344a3b',primary:'#435e4b',paper:'#faf9f3',soft:'#e9eddf'}
    site.themeStyle=`--ink:${theme.ink};--primary:${theme.primary};--paper:${theme.paper};--soft:${theme.soft};`
    wx.setNavigationBarColor({frontColor:'#000000',backgroundColor:theme.paper})
    wx.setTabBarStyle({selectedColor:theme.primary,backgroundColor:theme.paper})
    this.siteLoadedAt=Date.now()
    this.globalData.site = site
    return site
  }
})
