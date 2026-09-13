// 极简 PNG 解码：仅支持 8bit、非隔行的灰度/真彩/带 Alpha 图像。
// 用途：把 Offscreen 渲染出的 RGBA PNG 解成像素，供 ICO 生成 DIB 条目。
import zlib from 'node:zlib'

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/**
 * @param {Buffer} buffer PNG 文件内容
 * @returns {{ width: number, height: number, rgba: Buffer }} RGBA8888 像素
 */
export function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG file')

  let pos = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  const idat = []

  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth: ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNG is not supported')
  const channels = CHANNELS[colorType]
  if (!channels) throw new Error(`unsupported PNG color type: ${colorType}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)

  let cursor = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++]
    for (let x = 0; x < stride; x++) {
      const value = raw[cursor + x]
      const left = x >= channels ? pixels[y * stride + x - channels] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0
      let out
      switch (filter) {
        case 0: out = value; break
        case 1: out = value + left; break
        case 2: out = value + up; break
        case 3: out = value + ((left + up) >> 1); break
        case 4: {
          const p = left + up - upLeft
          const pa = Math.abs(p - left)
          const pb = Math.abs(p - up)
          const pc = Math.abs(p - upLeft)
          out = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
          break
        }
        default: throw new Error(`unsupported PNG filter: ${filter}`)
      }
      pixels[y * stride + x] = out & 0xff
    }
    cursor += stride
  }

  // 统一展开成 RGBA
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const src = i * channels
    const dst = i * 4
    switch (colorType) {
      case 0: {
        const g = pixels[src]
        rgba[dst] = g; rgba[dst + 1] = g; rgba[dst + 2] = g; rgba[dst + 3] = 255
        break
      }
      case 4: {
        const g = pixels[src]
        rgba[dst] = g; rgba[dst + 1] = g; rgba[dst + 2] = g; rgba[dst + 3] = pixels[src + 1]
        break
      }
      case 2:
        rgba[dst] = pixels[src]; rgba[dst + 1] = pixels[src + 1]; rgba[dst + 2] = pixels[src + 2]; rgba[dst + 3] = 255
        break
      case 6:
        rgba[dst] = pixels[src]; rgba[dst + 1] = pixels[src + 1]; rgba[dst + 2] = pixels[src + 2]; rgba[dst + 3] = pixels[src + 3]
        break
    }
  }

  return { width, height, rgba }
}
