// 线上接口保持固定域名，服务器迁移、内容和业务规则更新都通过后端完成。
// 默认所有环境连接云端；本地联调时才将 useLocalBackend 改为 true。
// 本机模式还要求开发版且运行于开发者工具，真机和体验/正式版始终使用 HTTPS。
// 微信审核可能使用 develop，因此不能只根据 envVersion 选择本机地址。
const useLocalBackend = false
let localTools = false
try {
  const account = wx.getAccountInfoSync()
  const device = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
  localTools = account.miniProgram.envVersion === 'develop' && device.platform === 'devtools'
} catch (_) {
  // 获取环境失败时仍使用正式接口，避免真机请求自己的 127.0.0.1。
}
module.exports = {
  apiBase: useLocalBackend && localTools ? 'http://127.0.0.1:8790' : 'https://booking.yuhetangtcm.com',
  developmentLogin: false
}
