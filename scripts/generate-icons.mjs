// 从 build/app-icon.svg 生成全部尺寸的 PNG 与 Windows ICO。
// 用法：node scripts/generate-icons.mjs
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const svgSource = path.join(root, 'build', 'app-icon.svg')
const workDir = path.join(root, 'build', 'icons')

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

fs.rmSync(workDir, { recursive: true, force: true })
fs.mkdirSync(workDir, { recursive: true })

const electronBin = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
execFileSync(electronBin, [path.join(root, 'scripts', 'icon-renderer.cjs')], { stdio: 'inherit' })
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const pngFile = path.join(workDir, `icon-${size}.png`)
  if (!fs.existsSync(pngFile) || fs.statSync(pngFile).size === 0) {
    throw new Error(`render failed for size ${size}`)
  }
  console.log(`rendered ${size}x${size}`)
}

// ── 生成 ICO（PNG 条目，Windows 10+ 支持）──
function icoEntry(png, size) {
  const header = Buffer.alloc(16)
  header.writeUInt8(size >= 256 ? 0 : size, 0)
  header.writeUInt8(size >= 256 ? 0 : size, 1)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(32, 4)
  header.writeUInt32LE(png.length, 8)
  return header
}

const pngs = ICO_SIZES.map(size => ({ size, data: fs.readFileSync(path.join(workDir, `icon-${size}.png`)) }))
const headerSize = 6 + ICO_SIZES.length * 16
let offset = headerSize
const dirChunks = []
const dataChunks = []
for (const { size, data } of pngs) {
  const entry = icoEntry(data, size)
  entry.writeUInt32LE(offset, 12)
  dirChunks.push(entry)
  dataChunks.push(data)
  offset += data.length
}
const ico = Buffer.concat([Buffer.from([0, 0, 1, 0, ICO_SIZES.length, 0]), ...dirChunks, ...dataChunks])
fs.writeFileSync(path.join(root, 'build', 'app-icon.ico'), ico)
fs.writeFileSync(path.join(root, 'build', 'icon.ico'), ico)

// ── 分发到各使用点 ──
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'build', 'icon-256.png'))
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'public', 'icon-256.png'))
fs.copyFileSync(path.join(workDir, 'icon-256.png'), path.join(root, 'public', 'favicon.png'))
console.log('ICO + PNG distribution done')
