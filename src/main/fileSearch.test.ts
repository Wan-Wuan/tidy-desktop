import path from 'path'
import { describe, it, expect } from 'vitest'
import { dedupeByPath, parseEverythingJson } from './fileSearch'

describe('dedupeByPath', () => {
  it('按完整路径去重（Windows 大小写不敏感），保留首次出现', () => {
    const out = dedupeByPath([
      { name: 'a.txt', path: 'C:/X/A.txt', isDir: false },
      { name: 'a.txt', path: 'c:/x/a.txt', isDir: false },
      { name: 'a.txt', path: 'D:/y/a.txt', isDir: false }
    ])
    expect(out).toHaveLength(2)
    expect(out[0].path).toBe('C:/X/A.txt')
  })

  it('同名文件位于不同磁盘 / 不同目录时全部保留（不按文件名去重）', () => {
    const out = dedupeByPath([
      { name: 'config.json', path: 'C:/a/config.json', isDir: false },
      { name: 'config.json', path: 'D:/b/config.json', isDir: false },
      { name: 'config.json', path: 'E:/c/config.json', isDir: false }
    ])
    expect(out).toHaveLength(3)
  })
})

describe('parseEverythingJson', () => {
  it('兼容直接数组形态', () => {
    const out = parseEverythingJson([
      { name: 'a.txt', path: 'C:/a.txt', size: 10 },
      { name: 'b', path: 'C:/b', attributes: 0x10 }
    ])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ name: 'a.txt', path: 'C:/a.txt', isDir: false, size: 10 })
    expect(out[1].isDir).toBe(true)
  })

  it('兼容 { results: [...] } 形态', () => {
    const out = parseEverythingJson({ results: [{ name: 'x', path: 'C:/x' }] })
    expect(out).toEqual([{ name: 'x', path: 'C:/x', isDir: false, size: undefined }])
  })

  it('attributes 含目录位即 isDir', () => {
    const out = parseEverythingJson([{ path: 'C:/dir', attributes: 0x10 }])
    expect(out[0].isDir).toBe(true)
  })

  it('缺 name 时用 basename 兜底', () => {
    const out = parseEverythingJson([{ path: 'C:/foo/bar.txt' }])
    expect(out[0].name).toBe('bar.txt')
  })

  it('缺 path 的条目被跳过', () => {
    const out = parseEverythingJson([{ name: 'no-path' }, { name: 'ok', path: 'C:/ok' }])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('ok')
  })

  it('非数组 / 非对象输入返回空数组', () => {
    expect(parseEverythingJson(null)).toEqual([])
    expect(parseEverythingJson('nope')).toEqual([])
    expect(parseEverythingJson({})).toEqual([])
  })

  it('Everything 的 path 是所在目录：与 name 拼接成完整路径', () => {
    // Everything 真实返回形态：path 只到目录，name 才是文件名
    const out = parseEverythingJson([{ name: 'report.txt', path: 'D:/docs', size: 10 }])
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('report.txt')
    expect(out[0].path).toBe(path.join('D:/docs', 'report.txt'))
  })

  it('同一目录下的多个命中项各自得到不同完整路径（不再互相覆盖）', () => {
    const out = parseEverythingJson([
      { name: 'a.txt', path: 'C:/same' },
      { name: 'b.txt', path: 'C:/same' }
    ])
    expect(out).toHaveLength(2)
    expect(new Set(out.map((r) => r.path)).size).toBe(2)
  })

  it('type=folder 判定为目录', () => {
    const out = parseEverythingJson([{ name: 'build', path: 'C:/proj', type: 'folder' }])
    expect(out[0].isDir).toBe(true)
    expect(out[0].path).toBe(path.join('C:/proj', 'build'))
  })

  it('path 已是完整路径时不再重复拼接', () => {
    const out = parseEverythingJson([{ name: 'a.txt', path: 'C:/a.txt' }])
    expect(out[0].path).toBe('C:/a.txt')
  })

  it('跨盘同名文件在解析后全部保留', () => {
    const out = parseEverythingJson([
      { name: 'same.txt', path: 'C:/one' },
      { name: 'same.txt', path: 'D:/two' },
      { name: 'same.txt', path: 'E:/three' }
    ])
    expect(out).toHaveLength(3)
  })
})
