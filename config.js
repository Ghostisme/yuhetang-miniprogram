// 改为已配置 request / downloadFile 合法域名的 HTTPS 地址。
// 本地开发工具需要预览时才临时开启 developmentLogin，同时关闭工具内的域名校验。
// 正式上传前必须运行 npm run check:mini，并保持 developmentLogin 为 false。
module.exports = {
  apiBase: 'http://127.0.0.1:8790',
  developmentLogin: false
}
