import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = path.resolve(root, process.env.TARO_APP_OUTPUT_ROOT || 'dist/weapp')
const app = JSON.parse(await readFile(path.join(output, 'app.json'), 'utf8'))
const pages = [...(app.pages || []), ...(app.subPackages || app.subpackages || []).flatMap(pack =>
  (pack.pages || []).map(page => path.posix.join(pack.root, page)))]
if (!pages.length) throw new Error('微信构建未注册任何页面。')

const missing = [], checked = new Set()
async function checkFile(relative) {
  if (checked.has(relative)) return !missing.includes(relative)
  checked.add(relative)
  try {
    if ((await stat(path.join(output, relative))).isFile()) return true
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
  }
  missing.push(relative)
  return false
}
await checkFile('app.js')
await checkFile('app.json')
for (const page of pages) {
  for (const extension of ['.js', '.json', '.wxml', '.wxss']) await checkFile(page + extension)
}
// Shared component styles may be extracted from pages. Follow every WXSS import
// so successful compilation also guarantees that imported styles exist on disk.
const styles = ['app.wxss', ...pages.map(page => page + '.wxss')], visited = new Set()
while (styles.length) {
  const file = styles.pop()
  if (visited.has(file)) continue
  visited.add(file)
  if (!await checkFile(file)) continue
  const css = await readFile(path.join(output, file), 'utf8')
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    styles.push(match[1].startsWith('/') ? match[1].slice(1) : path.posix.join(path.posix.dirname(file), match[1]))
  }
}
// Check the actual compiled files, including shared chunks. Source checks alone
// cannot catch an old output directory being selected for preview or upload.
const obsolete = [], directories = ['']
const manualSubscriptionUi = /subscription-preferences|booking-subscriptions|订阅预约及到店提醒|(["'`])微信订阅设置\1/
while (directories.length) {
  const directory = directories.pop()
  for (const entry of await readdir(path.join(output, directory), { withFileTypes: true })) {
    const relative = path.posix.join(directory, entry.name)
    if (entry.isDirectory()) directories.push(relative)
    else if (/\.(js|wxml|wxss)$/.test(entry.name) && manualSubscriptionUi.test(await readFile(path.join(output, relative), 'utf8'))) obsolete.push(relative)
  }
}
if (missing.length) {
  console.error('微信构建产物缺失：\n' + missing.map(file => '  ' + file).join('\n'))
  process.exitCode = 1
}
if (obsolete.length) {
  console.error('微信构建仍包含已移除的手动订阅界面，请从最新源码重新构建：\n' + obsolete.map(file => '  ' + file).join('\n'))
  process.exitCode = 1
}
if (!missing.length && !obsolete.length) {
  console.log(`微信构建完整性检查通过：${pages.length} 个页面的 JS/JSON/WXML/WXSS、应用入口及全部样式引用均存在。`)
  console.log('订阅入口检查通过：编译产物不含独立订阅卡片、设置按钮或预约前的自定义提醒面板。')
}
