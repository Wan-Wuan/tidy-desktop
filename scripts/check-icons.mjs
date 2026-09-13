// 图标一致性校验：发布前跑一遍，确保 exe / 快捷方式 / 窗口三处图标同源。
// 用法：
//   node scripts/check-icons.mjs                      # 只校验 ICO/PNG 资源（打包前跑）
//   node scripts/check-icons.mjs --exe                # 追加校验 release/win-unpacked 的 exe（打包后跑）
//   node scripts/check-icons.mjs <path/to/app.exe>    # 追加校验指定 exe
//
// 注意：exe 校验默认关闭。打包前 release/win-unpacked 里是上一版 exe，此时校验必然误报。
import fs from 'node:fs'
import path from 'node:path'
import { parseIco } from './lib/ico.mjs'

const root = process.cwd()
const problems = []
const lines = []

const ok = (msg) => lines.push(`  [ok]   ${msg}`)
const bad = (msg) => { lines.push(`  [FAIL] ${msg}`); problems.push(msg) }

const icoPath = path.join(root, 'build', 'app-icon.ico')
const aliasPath = path.join(root, 'build', 'icon.ico')
const png256Path = path.join(root, 'build', 'icon-256.png')
const publicPngPath = path.join(root, 'public', 'icon-256.png')
const publicFaviconPath = path.join(root, 'public', 'favicon.png')

const REQUIRED_SIZES = [16, 32, 48, 256]

for (const file of [icoPath, aliasPath, png256Path, publicPngPath, publicFaviconPath]) {
  if (!fs.existsSync(file)) bad(`缺少文件 ${path.relative(root, file)}（先执行 npm run icons:generate）`)
}

if (problems.length === 0) {
  const ico = fs.readFileSync(icoPath)

  if (!fs.readFileSync(aliasPath).equals(ico)) bad('build/icon.ico 与 build/app-icon.ico 内容不一致')
  else ok('build/icon.ico 与 build/app-icon.ico 一致')

  const parsed = parseIco(ico)
  ok(`ICO 含 ${parsed.count} 个尺寸：${parsed.entries.map((e) => e.width).join('/')}`)

  for (const entry of parsed.entries) {
    const label = `${entry.width}x${entry.height}`
    if (entry.width !== entry.height) bad(`${label} 不是正方形`)
    if (entry.planes !== 1) bad(`${label} wPlanes=${entry.planes}（应为 1）`)
    if (entry.bitCount !== 32) bad(`${label} wBitCount=${entry.bitCount}（应为 32）`)
    if (entry.colorCount !== 0) bad(`${label} bColorCount=${entry.colorCount}（≥8bpp 应为 0）`)
    if (!entry.inRange) bad(`${label} 数据超出文件范围`)
    if (entry.kind === 'unknown') bad(`${label} 数据既不是 PNG 也不是 BMP`)
    if (entry.width >= 256 && entry.kind !== 'png') bad(`${label} 建议使用 PNG 压缩条目`)
    if (entry.width < 256 && entry.kind !== 'dib') bad(`${label} 小尺寸应使用 BMP 条目`)
  }

  const sizes = parsed.entries.map((e) => e.width)
  for (const size of REQUIRED_SIZES) {
    if (!sizes.includes(size)) bad(`缺少 Windows 必须的 ${size}x${size} 尺寸`)
  }
  if (problems.length === 0) ok(`必备尺寸齐全（${REQUIRED_SIZES.join('/')}）`)

  const entry256 = parsed.entries.find((e) => e.width === 256 && e.kind === 'png')
  const png256 = fs.readFileSync(png256Path)
  if (entry256 && !entry256.payload.equals(png256)) bad('ICO 的 256 条目与 build/icon-256.png 不同源')
  else if (entry256) ok('ICO 的 256 条目与 build/icon-256.png 同源')

  if (!fs.readFileSync(publicPngPath).equals(png256)) bad('public/icon-256.png 与 build/icon-256.png 不一致')
  else ok('public/icon-256.png 一致')

  if (!fs.readFileSync(publicFaviconPath).equals(png256)) bad('public/favicon.png 与 build/icon-256.png 不一致')
  else ok('public/favicon.png 一致')

  // ── exe 内嵌校验：只在明确要求时执行 ──
  // 打包前 release/win-unpacked 里躺的是上一版 exe，若在此处校验必然误报，
  // 因此默认跳过，由打包后的 `check-icons.mjs --exe` 负责。
  const args = process.argv.slice(2)
  const explicitExe = args.find((a) => !a.startsWith('--'))
  const wantsExe = Boolean(explicitExe) || args.includes('--exe')

  let exePath = explicitExe ? path.resolve(explicitExe) : null
  if (!exePath && wantsExe) {
    const unpacked = path.join(root, 'release', 'win-unpacked')
    if (fs.existsSync(unpacked)) {
      const candidate = fs.readdirSync(unpacked).find((f) => f.endsWith('.exe'))
      if (candidate) exePath = path.join(unpacked, candidate)
    }
  }

  if (!wantsExe) {
    lines.push('  [skip] 未要求校验打包产物（加 --exe 校验 release/win-unpacked）')
  } else if (!exePath || !fs.existsSync(exePath)) {
    bad(`找不到 exe：${exePath || 'release/win-unpacked/*.exe'}`)
  } else if (fs.statSync(exePath).mtimeMs < fs.statSync(icoPath).mtimeMs) {
    // 旧产物 + 新图标 = 必然是上一版打包出来的，不要误判成"没内嵌"
    lines.push(`  [skip] ${path.basename(exePath)} 早于 build/app-icon.ico，属于上一版产物；请在打包完成后重新校验`)
  } else {
    const exe = fs.readFileSync(exePath)
    const missing = parsed.entries.filter((e) => !exe.includes(e.payload)).map((e) => `${e.width}x${e.height}`)
    if (missing.length > 0) bad(`${path.basename(exePath)} 未内嵌图标：${missing.join('、')}`)
    else ok(`${path.basename(exePath)} 已内嵌全部 ${parsed.count} 个尺寸`)
  }
}

console.log(`图标校验（${path.relative(root, icoPath)}）`)
console.log(lines.join('\n'))

if (problems.length > 0) {
  console.error(`\n图标校验未通过：${problems.length} 项问题`)
  process.exit(1)
}
console.log('\n图标校验通过')
