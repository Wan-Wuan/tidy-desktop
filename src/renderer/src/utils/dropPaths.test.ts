import { describe, expect, it } from 'vitest'
import { getDroppedPaths } from './dropPaths'

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
})
