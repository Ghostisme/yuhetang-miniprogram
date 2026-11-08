import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(root, process.env.TARO_APP_OUTPUT_ROOT || 'dist/weapp')
const candidates = [process.env.WCSC_PATH, ...[
  'D:/微信web开发者工具',
  path.join(process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)', 'Tencent/微信web开发者工具'),
  path.join(process.env.ProgramFiles || 'C:/Program Files', 'Tencent/微信web开发者工具'),
].map(directory => path.join(directory, 'resources/app.asar.unpacked/node_modules/wcc-exec/wcsc.exe'))]
const compiler = candidates.find(candidate => candidate && existsSync(candidate))
const required = process.argv.includes('--required') || process.env.REQUIRE_NATIVE_WXSS === 'true'
if (!compiler) {
  const explanation = '未找到微信原生 WXSS 编译器；设置 WCSC_PATH 指向开发者工具的 wcsc.exe。'
  if (required) throw new Error(explanation)
  console.warn(explanation + ' 本次仅完成 Taro 构建，不代表微信原生样式编译通过。')
  process.exit(0)
}

const files = [], pending = ['']
while (pending.length) {
  const directory = pending.pop()
  for (const entry of await readdir(path.join(output, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) pending.push(relative)
    else if (entry.name.endsWith('.wxss')) files.push(relative)
  }
}
if (!files.length) throw new Error('构建目录中没有 WXSS，无法验证。')
const hashes = {}
for (const file of files.sort()) {
  hashes[file] = createHash('sha256').update(await readFile(path.join(output, file))).digest('hex')
}
// wcsc resolves imports against the supplied file set, as the developer tools do.
// Include './' on every path so app.wxss imports and its sibling inputs match.
const result = spawnSync(compiler, files.map(file => './' + file), { cwd: output, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true })
const failures = result.error || result.status !== 0 ? [{ file: 'WXSS', reason: result.error?.message || result.stderr || result.stdout || `exit=${result.status}` }] : []
const report = { status: failures.length ? 'failed' : 'passed', compiler, checkedAt: new Date().toISOString(), files: hashes, failures }
const reportPath = path.join(root, 'backups/weapp-native/result.json')
await mkdir(path.dirname(reportPath), { recursive: true })
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
if (failures.length) {
  for (const failure of failures) console.error(`${failure.file}: ${failure.reason.trim()}`)
  throw new Error(`${failures.length} 个 WXSS 未通过微信原生编译，构建已停止。`)
}
console.log(`微信原生 WXSS 编译通过：${files.length} 个样式文件（wcsc），含应用全局样式及全部页面、组件。`)
