const config = require('../config')
let loginPromise
function request(path, options = {}) {
  const token = wx.getStorageSync('yht-token')
  return new Promise((resolve, reject) => wx.request({
    url: config.apiBase.replace(/\/$/, '') + path,
    method: options.method || 'GET', data: options.data,
    timeout: 15000,
    header: Object.assign({'content-type': 'application/json'}, token ? {Authorization: 'Bearer ' + token} : {}, options.headers || {}),
    success(r) {
      if (r.statusCode >= 200 && r.statusCode < 300) return resolve(r.data)
      if (r.statusCode === 401) wx.removeStorageSync('yht-token')
      reject(new Error(r.data && r.data.message || '操作未完成，请稍后重试。'))
    }, fail() {reject(new Error('暂时无法连接门店服务，请检查网络后重试。'))}
  }))
}
function id() {return 'mini-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)}
async function login() {
  if (wx.getStorageSync('yht-token')) return
  if (loginPromise) return loginPromise
  loginPromise = (async () => {
    let result
    if (config.developmentLogin) {
      const runtime = await request('/api/runtime')
      if (!runtime.developmentLogin) throw new Error('当前环境禁止模拟登录。')
      let deviceId = wx.getStorageSync('yht-device')
      if (!deviceId) {deviceId = id(); wx.setStorageSync('yht-device', deviceId)}
      result = await request('/api/auth/dev-customer', {method: 'POST', data: {deviceId}})
    } else {
      const code = await new Promise((resolve, reject) => wx.login({success: r => r.code ? resolve(r.code) : reject(new Error('微信登录未完成，请重试。')), fail: () => reject(new Error('微信登录未完成。'))}))
      result = await request('/api/auth/wechat', {method: 'POST', data: {code}})
    }
    wx.setStorageSync('yht-token', result.token)
  })()
  try {await loginPromise} finally {loginPromise = null}
}
function media(value) {
  if (typeof value === 'string' && /^\/(media|uploads)\//.test(value)) return config.apiBase.replace(/\/$/, '') + value
  if (Array.isArray(value)) return value.map(media)
  if (value && typeof value === 'object') return Object.keys(value).reduce((out, key) => {out[key] = media(value[key]); return out}, {})
  return value
}
function day(offset = 0) {
  const date = new Date(Date.now() + 8 * 3600000 + offset * 86400000)
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0')
}
function error(e) {wx.showToast({title: e.message || '操作未完成', icon: 'none', duration: 3500})}
function call(phone) {if (phone) wx.makePhoneCall({phoneNumber: phone}); else wx.showToast({title:'门店电话待完善，请使用在线客服',icon:'none'})}
function privacy() {
  if (!wx.getPrivacySetting || !wx.requirePrivacyAuthorize) return Promise.resolve()
  return new Promise((resolve, reject) => wx.getPrivacySetting({success: r => {
    if (!r.needAuthorization) return resolve()
    wx.requirePrivacyAuthorize({success: resolve, fail: () => reject(new Error('请先阅读并同意小程序隐私保护指引。'))})
  }, fail: () => reject(new Error('隐私设置读取失败，请重新进入小程序。'))}))
}
// 必须由用户点击触发；拒绝订阅不影响预约申请。
function subscribe(templateId) {
  if (!templateId || !wx.requestSubscribeMessage) return Promise.resolve()
  return new Promise(resolve => wx.requestSubscribeMessage({tmplIds: [templateId], success: async r => {
    if (r[templateId] === 'accept') {
      try {await request('/api/me/subscriptions', {method:'POST', data:{templateId, accepted:true}})} catch (e) {error(e)}
    }
    resolve()
  }, fail: resolve}))
}
module.exports = {request, login, media, day, id, error, call, privacy, subscribe}
