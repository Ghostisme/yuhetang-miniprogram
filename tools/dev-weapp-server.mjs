import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const base = (process.env.TARO_APP_API_BASE || 'https://mp-admin.hetuonian.cn').replace(/\/$/, '')

try {
  const url = new URL(base)
  if (url.protocol !== 'https:' || url.origin !== base) throw new Error('请使用完整的 HTTPS 接口域名，不带路径或登录凭证')
  const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) })
  const health = await response.json()
  if (!response.ok || health.status !== 'ok' || health.mode !== 'production' || health.database !== 'connected') {
    throw new Error('线上 Java 或数据库尚未就绪；本地联调请使用 npm run dev:weapp:local')
  }
  const configResponse = await fetch(`${base}/api/runtime`, { signal: AbortSignal.timeout(8000) })
  const runtime = await configResponse.json()
  if (!configResponse.ok || runtime.developmentLogin || !runtime.wechatLoginConfigured) {
    throw new Error('线上接口尚未配置真实微信登录')
  }
} catch (error) {
  console.error(`无法连接线上小程序接口：${base}（${error.message}）。`)
  process.exit(1)
}

console.log(`线上联调：${base}；使用真实微信登录，模拟登录已关闭。`)
console.log(`在线咨询会进入同一套线上管理后台：${base}/admin。`)
console.log(`微信开发者工具请打开：${root}（编译目录 dist/weapp）。`)
const compiler = spawn(process.execPath, [path.join(root, 'node_modules/@tarojs/cli/bin/taro'), 'build', '--type', 'weapp', '--watch'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', TARO_APP_API_BASE: base, TARO_APP_DEV_LOGIN: 'false' },
})
compiler.on('error', error => { console.error(error.message); process.exitCode = 1 })
compiler.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => compiler.kill(signal))
