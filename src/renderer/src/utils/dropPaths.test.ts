import { describe, expect, it } from 'vitest'
import { buildShortcutTargetMap, getDroppedPathIdentities, getDroppedPaths, normalizeDroppedPath } from './dropPaths'

describe('getDroppedPaths', () => {
  it('collects file object paths and Windows file URIs without duplicates', () => {
    expect(getDroppedPaths(
      [{ path: 'C:\\Desktop\\Tool.lnk' }],
      'file:///C:/Desktop/Tool.lnk\r\nfile:///D:/Apps/Editor.exe',
      ''
    )).toEqual(['C:\\Desktop\\Tool.lnk', 'D:\\Apps\\Editor.exe'])
  })

  it('ignores web URLs while accepting a plain Windows path', () => {
    expect(getDroppedPaths([], 'https://example.com/app.exe', 'C:\\Tools\\App.lnk')).toEqual(['C:\\Tools\\App.lnk'])
  })

  it('normalizes equivalent Windows paths for duplicate detection', () => {
    expect(normalizeDroppedPath(' C:/Tools/App.EXE/ ')).toBe('c:\\tools\\app.exe')
    expect(normalizeDroppedPath('C:\\TOOLS\\APP.exe')).toBe('c:\\tools\\app.exe')
  })

  it('uses a shortcut and its resolved executable as the same dropped identity', () => {
    const link = 'C:\\Users\\Wan-wuan\\Desktop\\OpenCode.lnk'
    const target = 'C:\\Programs\\OpenCode\\OpenCode.exe'
    const targets = buildShortcutTargetMap([{ filePath: link, targetPath: target }])
    expect(getDroppedPathIdentities(link, targets)).toEqual([
      'c:\\users\\wan-wuan\\desktop\\opencode.lnk',
      'c:\\programs\\opencode\\opencode.exe'
    ])
    const knownPaths = new Set([normalizeDroppedPath(target)])
    expect(getDroppedPathIdentities(link, targets).some(identity => knownPaths.has(identity))).toBe(true)
  })
})
