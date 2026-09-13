// 从 build/app-icon.svg 生成全部尺寸的 PNG 与 Windows ICO。
// 用法：node scripts/generate-icons.mjs
//
// ICO 规格说明（决定 Windows 任务栏/资源管理器能否正常渲染）：
//   - 16/24/32/48/64/128 使用 BMP(DIB) 条目 —— Windows Shell 与旧版图标 API 只对这种条目有完整支持
//   - 256 使用 PNG 压缩条目 —— Vista+ 官方支持的 PNG 尺寸，兼顾体积
//   - 目录项 wPlanes=1 / wBitCount=32 / bColorCount=0（详见 scripts/lib/ico.mjs）
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildIco, dibFromPng, ICO_SIZES, DIB_SIZES, parseIco } from './lib/ico.mjs'

const root = process.cwd()
const svgSource = path.join(root, 'build', 'app-icon.svg')
const workDir = path.join(root, 'build', 'icons')

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

fs.rmSync(workDir, { recursive: true, force: true })
fs.mkdirSync(workDir, { recursive: true })

const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
execFileSync(electronBin, [path.join(root, 'scripts', 'icon-renderer.cjs')], { stdio: 'inherit' })
for (const size of PNG_SIZES) {
  const pngFile = path.join(workDir, `icon-${size}.png`)
  if (!fs.existsSync(pngFile) || fs.statSync(pngFile).size === 0) {
    throw new Error(`render failed for size ${size}`)
  }
  console.log(`rendered ${size}x${size}`)
}

// ── 组装 ICO ──
const items = ICO_SIZES.map((size) => {
  const png = fs.readFileSync(path.join(workDir, `icon-${size}.png`))
  const payload = DIB_SIZES.includes(size) ? dibFromPng(png) : png
  return { size, payload }
})
const ico = buildIco(items)

// 自检：确保写出的 ICO 结构合规，避免再出现"图标已配置却仍是默认 Electron 图标"
const parsed = parseIco(ico)
for (const entry of parsed.entries) {
  if (entry.planes !== 1 || entry.bitCount !== 32) {
    throw new Error(`ICO entry ${entry.width}x${entry.height} has planes=${entry.planes} bitCount=${entry.bitCount}`)
  }
  if (!entry.inRange) throw new Error(`ICO entry ${entry.width}x${entry.height} payload out of range`)
  if (entry.kind === 'unknown') throw new Error(`ICO entry ${entry.width}x${entry.height} has unknown payload`)
}
console.log(`ICO assembled: ${parsed.entries.map((e) => `${e.width}(${e.kind})`).join(' ')} / ${ico.length} bytes`)

fs.writeFileSync(path.join(root, 'build', 'app-icon.ico'), ico)
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico)

// ── 分发到各使用点 ──
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'build', 'icon-256.png'))
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'public', 'icon-256.png'))
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'public', 'favicon.png'))
console.log('ICO + PNG distribution done')
