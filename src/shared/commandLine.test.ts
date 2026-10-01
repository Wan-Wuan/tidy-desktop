import { describe, it, expect } from 'vitest'
import { splitCommandLine, formatCommandPreview, formatWindowsArguments } from './commandLine'

describe('splitCommandLine', () => {
  it('空串与纯空白都给空数组', () => {
    expect(splitCommandLine('')).toEqual([])
    expect(splitCommandLine('   ')).toEqual([])
    expect(splitCommandLine('\t\n ')).toEqual([])
  })

  it('单个参数', () => {
    expect(splitCommandLine('--goto')).toEqual(['--goto'])
  })

  it('按空白切分多个参数', () => {
    expect(splitCommandLine('-n  --flag\tvalue')).toEqual(['-n', '--flag', 'value'])
  })

  it('双引号包裹的内容保留空格', () => {
    expect(splitCommandLine('"C:\\Program Files\\a b.txt"'))
      .toEqual(['C:\\Program Files\\a b.txt'])
  })

  it('引号与裸参数混排', () => {
    expect(splitCommandLine('-n "a b" -x')).toEqual(['-n', 'a b', '-x'])
  })

  it('紧贴的引号也认得出来', () => {
    expect(splitCommandLine('--file="a b.txt"')).toEqual(['--file=a b.txt'])
  })

  it('\\" 表示一个字面双引号', () => {
    expect(splitCommandLine('say \\"hi\\"')).toEqual(['say', '"hi"'])
  })

  it('反斜杠后跟普通字符时原样保留', () => {
    expect(splitCommandLine('C:\\tools\\a.exe')).toEqual(['C:\\tools\\a.exe'])
  })

  it('单引号不是特殊字符（这是 Windows 与 POSIX 最容易搞混的一点）', () => {
    expect(splitCommandLine("'a b'")).toEqual(["'a", "b'"])
  })

  it('显式的 "" 产生一个空参数，连续空白则不产生', () => {
    expect(splitCommandLine('a  b')).toEqual(['a', 'b'])
    expect(splitCommandLine('a "" b')).toEqual(['a', '', 'b'])
  })

  it('引号未闭合时按「到结尾都在引用内」处理，不报错', () => {
    expect(splitCommandLine('-n "a b')).toEqual(['-n', 'a b'])
  })

  it('去掉包裹引号后为空也算一个参数', () => {
    expect(splitCommandLine('""')).toEqual([''])
  })

  it('参数里的 shell 元字符只是普通字符——这正是绝不交给 shell 的原因', () => {
    expect(splitCommandLine('a & del /f /q C:\\'))
      .toEqual(['a', '&', 'del', '/f', '/q', 'C:\\'])
  })
})

describe('formatCommandPreview', () => {
  it('拼成一行，含空格的参数加引号', () => {
    expect(formatCommandPreview('C:\\tools\\a.exe', ['-n', 'C:\\My Files\\x.txt']))
      .toBe('C:\\tools\\a.exe -n "C:\\My Files\\x.txt"')
  })

  it('空参数显示为一对引号', () => {
    expect(formatCommandPreview('a.exe', [''])).toBe('a.exe ""')
  })

  it('参数里的引号被转义，避免预览产生歧义', () => {
    expect(formatCommandPreview('a.exe', ['say "hi"'])).toBe('a.exe "say \\"hi\\""')
  })

  it('没有参数时只有命令本身', () => {
    expect(formatCommandPreview('a.exe', [])).toBe('a.exe')
  })
})

describe('formatWindowsArguments', () => {
  /* 这条通道只服务于提权启动：`Start-Process -ArgumentList` 只收字符串，
     它把字符串原样拼到子进程命令行上，子进程再解析回来。所以这里必须是
     与 splitCommandLine **对偶**的再引用——写错了，参数到子进程那里就被拆开了。 */

  it('普通参数原样拼接', () => {
    expect(formatWindowsArguments(['-n', '--flag'])).toBe('-n --flag')
  })

  it('含空格的参数被引号包住', () => {
    expect(formatWindowsArguments(['--title=a b'])).toBe('"--title=a b"')
  })

  it('参数里的双引号被转义', () => {
    expect(formatWindowsArguments(['say "hi"'])).toBe('"say \\"hi\\""')
  })

  it('空参数保留为一对引号，不会被吞掉', () => {
    expect(formatWindowsArguments(['', 'x'])).toBe('"" x')
  })

  it('没有参数时是空串', () => {
    expect(formatWindowsArguments([])).toBe('')
  })

  it('与 splitCommandLine 对偶：拆分再拼回，语义不变', () => {
    const args = ['-n', 'C:\\My Files\\x.txt', 'say "hi"']
    const rejoined = splitCommandLine(formatWindowsArguments(args))
    expect(rejoined).toEqual(args)
  })

  it('对偶性覆盖 shell 元字符——它们只是普通字符', () => {
    const args = ['a & b', 'c | d', '%PATH%']
    expect(splitCommandLine(formatWindowsArguments(args))).toEqual(args)
  })
})
