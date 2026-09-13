// Windows ICO 组装 / 解析。
//
// 规范要点（此前实现的坑）：
//   - 目录项第 4、6 字节是 wPlanes / wBitCount，必须是 1 / 32；
//     BitsPerPixel 写 0 会让部分 Shell 图标 API 判定条目不可用并回退到系统默认图标。
//   - 第 2 字节 bColorCount 在 ≥8bpp 时必须为 0。
//   - PNG 压缩条目只有 256×256 被 Windows 正式支持，小尺寸应使用 BMP(DIB) 条目。
import { decodePng } from './png.mjs'

/** 需要以 BMP(DIB) 存储的尺寸；256 用 PNG 压缩条目 */
export const DIB_SIZES = [16, 24, 32, 48, 64, 128]
export const ICO_SIZES = [...DIB_SIZES, 256]

/**
 * 把一张 8bit RGBA PNG 转成 ICO 内使用的 BMP(DIB) 条目。
 * 结构：BITMAPINFOHEADER(40) + XOR 位图(BGRA, 自下而上) + AND 掩码(1bpp)
 */
export function dibFromPng(pngBuffer) {
  const { width, height, rgba } = decodePng(pngBuffer)
  if (width !== height) throw new Error(`icon must be square, got ${width}x${height}`)

  const xorSize = width * height * 4
  const maskRowBytes = ((width + 31) >> 5) * 4
  const maskSize = maskRowBytes * height
  const dib = Buffer.alloc(40 + xorSize + maskSize)

  dib.writeUInt32LE(40, 0)          // biSize
  dib.writeInt32LE(width, 4)        // biWidth
  dib.writeInt32LE(height * 2, 8)   // biHeight = XOR + AND
  dib.writeUInt16LE(1, 12)          // biPlanes
  dib.writeUInt16LE(32, 14)         // biBitCount
  dib.writeUInt32LE(0, 16)          // biCompression = BI_RGB
  dib.writeUInt32LE(xorSize + maskSize, 20)

  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4
    const dstRow = 40 + y * width * 4
    for (let x = 0; x < width; x++) {
      const s = srcRow + x * 4
      const d = dstRow + x * 4
      dib[d] = rgba[s + 2]      // B
      dib[d + 1] = rgba[s + 1]  // G
      dib[d + 2] = rgba[s]      // R
      dib[d + 3] = rgba[s + 3]  // A
    }
  }
  // AND 掩码保持全 0：不透明区域由 Alpha 通道表达
  return dib
}

/** @param {Array<{ size: number, payload: Buffer }>} items */
export function buildIco(items) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(items.length, 4)

  let offset = 6 + items.length * 16
  const directory = Buffer.alloc(items.length * 16)
  items.forEach((item, index) => {
    const at = index * 16
    directory.writeUInt8(item.size >= 256 ? 0 : item.size, at)
    directory.writeUInt8(item.size >= 256 ? 0 : item.size, at + 1)
    directory.writeUInt8(0, at + 2)      // bColorCount
    directory.writeUInt8(0, at + 3)      // bReserved
    directory.writeUInt16LE(1, at + 4)   // wPlanes
    directory.writeUInt16LE(32, at + 6)  // wBitCount
    directory.writeUInt32LE(item.payload.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += item.payload.length
  })

  return Buffer.concat([header, directory, ...items.map((item) => item.payload)])
}

/** 解析 ICO，供校验脚本使用 */
export function parseIco(buffer) {
  if (buffer.length < 6) throw new Error('file too small')
  const reserved = buffer.readUInt16LE(0)
  const type = buffer.readUInt16LE(2)
  const count = buffer.readUInt16LE(4)
  if (reserved !== 0 || type !== 1) throw new Error(`bad ICONDIR header (reserved=${reserved}, type=${type})`)

  const entries = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    if (at + 16 > buffer.length) throw new Error(`directory entry ${i} out of range`)
    const width = buffer.readUInt8(at) || 256
    const height = buffer.readUInt8(at + 1) || 256
    const colorCount = buffer.readUInt8(at + 2)
    const planes = buffer.readUInt16LE(at + 4)
    const bitCount = buffer.readUInt16LE(at + 6)
    const bytesInRes = buffer.readUInt32LE(at + 8)
    const offset = buffer.readUInt32LE(at + 12)
    const payload = buffer.subarray(offset, offset + bytesInRes)
    const isPng = payload.length >= 8 && payload.readUInt32BE(0) === 0x89504e47
    const isDib = !isPng && payload.length >= 40 && payload.readUInt32LE(0) === 40
    entries.push({
      index: i, width, height, colorCount, planes, bitCount, bytesInRes, offset,
      inRange: offset + bytesInRes <= buffer.length,
      kind: isPng ? 'png' : isDib ? 'dib' : 'unknown',
      dibBitCount: isDib ? payload.readUInt16LE(14) : null,
      payload
    })
  }
  return { count, entries }
}
