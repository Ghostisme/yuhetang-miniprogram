import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const base = (process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8790').replace(/\/$/, '')

try {
  const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) })
  const health = await response.json()
  if (!response.ok || health.status !== 'ok' || health.mode !== 'local') {
    throw new Error('接口未就绪或不是 local 模式')
  }
} catch (error) {
  console.error(`本地 Java 接口不可用：${base}/api/health（${error.message}）。`)
  console.error('请先在独立 backend 仓库执行 tools/start-local.ps1，再重新运行本命令。')
  process.exit(1)
}

// 本地工具配置不入库；允许模拟器访问 HTTP，不修改正式项目配置。
const privateFile = path.join(root, 'project.private.config.json')
let privateConfig = {}
try {
  privateConfig = JSON.parse((await readFile(privateFile, 'utf8')).replace(/^\uFEFF/, ''))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
privateConfig.setting = { ...privateConfig.setting, urlCheck: false }
await writeFile(privateFile, `${JSON.stringify(privateConfig, null, 2)}\n`, 'utf8')

console.log(`本地微信联调：${base}；模拟登录仅在 local 后端和开发构建中启用。`)
console.log(`微信开发者工具请打开：${root}（编译目录 dist/weapp）。`)
const compiler = spawn(process.execPath, [path.join(root, 'node_modules/@tarojs/cli/bin/taro'), 'build', '--type', 'weapp', '--watch'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', TARO_APP_API_BASE: base, TARO_APP_DEV_LOGIN: process.env.TARO_APP_DEV_LOGIN || 'true' },
})
compiler.on('error', error => { console.error(error.message); process.exitCode = 1 })
compiler.on('exit', code => { process.exitCode = code ?? 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => compiler.kill(signal))
