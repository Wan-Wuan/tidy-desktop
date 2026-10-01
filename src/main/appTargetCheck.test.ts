import { describe, expect, it } from 'vitest'
import { classifyAppTarget } from './appTargetCheck'

/**
 * 回归测试的来由：`validate-apps` 曾经对所有类型一律 `fs.access(path)`，
 * 而只有 `app` / `folder` 的 path 是磁盘路径。结果是**每个网址项目、
 * 每个商店应用、每条笔记都被判成"失效"**，而「清理失效项 / 一键修复」
 * 拿到这份结果就直接删——用户点一下"一键修复"，网址和商店应用集体消失。
 *
 * 所以这里逐个类型钉住"该不该去查盘"。
 */
describe('classifyAppTarget', () => {
  it('routes plain file paths to the filesystem check', () => {
    expect(classifyAppTarget('C:\\Tools\\app.exe', 'app')).toBe('needs-fs-check')
    expect(classifyAppTarget('D:\\Some Folder', 'folder')).toBe('needs-fs-check')
  })

  it('flags empty paths of filesystem-backed types as invalid', () => {
    expect(classifyAppTarget('', 'app')).toBe('invalid')
    expect(classifyAppTarget('   ', 'folder')).toBe('needs-fs-check')
  })

  it('never sends a url project to the filesystem check', () => {
    expect(classifyAppTarget('https://example.com', 'url')).toBe('valid')
    expect(classifyAppTarget('mailto:a@b.com', 'url')).toBe('valid')
    expect(classifyAppTarget('example.com', 'url')).toBe('invalid')
  })

  it('accepts a steam url and rejects anything else', () => {
    expect(classifyAppTarget('steam://run/440', 'steam')).toBe('valid')
    expect(classifyAppTarget('C:\\Games\\game.exe', 'steam')).toBe('invalid')
  })

  it('treats note and group as always valid — they have no path by design', () => {
    expect(classifyAppTarget('', 'note')).toBe('valid')
    expect(classifyAppTarget('', 'group')).toBe('valid')
  })

  it('accepts store app targets instead of looking for a file', () => {
    expect(classifyAppTarget('shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', 'app')).toBe('valid')
    expect(classifyAppTarget('Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', 'app')).toBe('valid')
  })

  it('does not mistake a windows drive letter for a url scheme', () => {
    /* `C:\Tools\app.exe` 里的 `C:` 也匹配 `^[a-z][a-z0-9+.-]*:`，所以这条
       "带协议地址"的判断**必须先按类型限定住**：一旦有人把它提到类型判断之前，
       `app` 类型的所有盘符路径都会被当成合法网址、再也不用查盘了。 */
    expect(classifyAppTarget('C:\\Tools\\app.exe', 'app')).toBe('needs-fs-check')
    expect(classifyAppTarget('C:\\Tools\\app.exe', 'folder')).toBe('needs-fs-check')
    /* 反过来，类型真写着 url 时，这种"带协议"的串就该被接受 */
    expect(classifyAppTarget('C:\\Tools\\app.exe', 'url')).toBe('valid')
  })

  it('falls back to the filesystem check for unknown types', () => {
    expect(classifyAppTarget('C:\\Tools\\app.exe', '')).toBe('needs-fs-check')
    expect(classifyAppTarget('C:\\Tools\\app.exe', 'something-new')).toBe('needs-fs-check')
  })
})
