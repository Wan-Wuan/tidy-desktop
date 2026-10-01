import { describe, expect, it } from 'vitest'
import {
  expandEnvVars,
  isAbsolutePath,
  isRelativePath,
  joinPath,
  resolveProjectPath,
  toPortablePath,
  toRelativePath
} from './pathResolve'

describe('isAbsolutePath / isRelativePath', () => {
  it('识别盘符路径（正反斜杠都算）', () => {
    expect(isAbsolutePath('C:\\Program Files\\app.exe')).toBe(true)
    expect(isAbsolutePath('D:/Games/steam.exe')).toBe(true)
    expect(isAbsolutePath('c:\\')).toBe(true)
  })

  it('识别 UNC 路径', () => {
    expect(isAbsolutePath('\\\\server\\share\\file.txt')).toBe(true)
  })

  it('相对路径不算绝对路径', () => {
    expect(isAbsolutePath('apps\\tool.exe')).toBe(false)
    expect(isAbsolutePath('..\\tool.exe')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
    expect(isRelativePath('apps\\tool.exe')).toBe(true)
    expect(isRelativePath('C:\\tool.exe')).toBe(false)
    expect(isRelativePath('')).toBe(false)
  })
})

describe('expandEnvVars', () => {
  it('替换已定义的变量并记录用到的名字', () => {
    const result = expandEnvVars('%ROOT%\\bin\\app.exe', [{ key: 'ROOT', value: 'D:\\Tools' }])
    expect(result.value).toBe('D:\\Tools\\bin\\app.exe')
    expect(result.usedKeys).toEqual(['ROOT'])
    expect(result.missingKeys).toEqual([])
  })

  it('变量名匹配忽略大小写', () => {
    const result = expandEnvVars('%root%\\a.exe', [{ key: 'ROOT', value: 'D:\\Tools' }])
    expect(result.value).toBe('D:\\Tools\\a.exe')
  })

  it('未定义的变量原样保留并记入 missingKeys（不改成空串）', () => {
    // 静默变空串会让路径指向别处，比报错更难排查
    const result = expandEnvVars('%NOPE%\\a.exe', [])
    expect(result.value).toBe('%NOPE%\\a.exe')
    expect(result.missingKeys).toEqual(['NOPE'])
    expect(result.usedKeys).toEqual([])
  })

  it('支持变量值里再引用变量', () => {
    const result = expandEnvVars('%A%\\x', [
      { key: 'A', value: '%B%\\sub' },
      { key: 'B', value: 'C:\\base' }
    ])
    expect(result.value).toBe('C:\\base\\sub\\x')
  })

  it('循环引用不会死循环，展开到层数上限后停下', () => {
    const result = expandEnvVars('%A%', [
      { key: 'A', value: '%B%' },
      { key: 'B', value: '%A%' }
    ])
    // 关键是不能挂住；结果停在引用形式上可接受
    expect(result.value).toMatch(/^%[AB]%$/)
  })

  it('同一个变量出现多次只记一次', () => {
    const result = expandEnvVars('%R%\\a;%R%\\b', [{ key: 'R', value: 'X' }])
    expect(result.value).toBe('X\\a;X\\b')
    expect(result.usedKeys).toEqual(['R'])
  })

  it('没有变量表时原样返回', () => {
    expect(expandEnvVars('C:\\plain.exe', null).value).toBe('C:\\plain.exe')
    expect(expandEnvVars('C:\\plain.exe', undefined).value).toBe('C:\\plain.exe')
  })
})

describe('toRelativePath', () => {
  it('同盘且在基准目录下时给出相对路径', () => {
    expect(toRelativePath('D:\\Portable\\apps\\tool.exe', 'D:\\Portable')).toBe('apps\\tool.exe')
  })

  it('大小写不敏感', () => {
    expect(toRelativePath('d:\\portable\\apps\\tool.exe', 'D:\\Portable')).toBe('apps\\tool.exe')
  })

  it('基准目录结尾带分隔符也能处理', () => {
    expect(toRelativePath('D:\\Portable\\a.exe', 'D:\\Portable\\')).toBe('a.exe')
  })

  it('跨盘返回 null', () => {
    // 相对路径表达不了跨盘，硬转会得到「跑飞」的路径
    expect(toRelativePath('E:\\x\\a.exe', 'D:\\Portable')).toBeNull()
  })

  it('不在基准目录之下时返回 null', () => {
    expect(toRelativePath('C:\\Windows\\a.exe', 'D:\\Portable')).toBeNull()
  })

  it('同名前缀的兄弟目录不算子路径', () => {
    // C:\app2 不能因为以 C:\app 开头就被当成子路径
    expect(toRelativePath('C:\\app2\\a.exe', 'C:\\app')).toBeNull()
  })

  it('目标等于基准目录时返回 "."', () => {
    expect(toRelativePath('D:\\Portable', 'D:\\Portable')).toBe('.')
  })

  it('基准目录为空或非法时返回 null', () => {
    expect(toRelativePath('D:\\a\\b.exe', '')).toBeNull()
    expect(toRelativePath('D:\\a\\b.exe', null)).toBeNull()
    expect(toRelativePath('D:\\a\\b.exe', 'relative\\root')).toBeNull()
  })
})

describe('joinPath', () => {
  it('拼接时补齐分隔符', () => {
    expect(joinPath('D:\\Portable', 'apps\\a.exe')).toBe('D:\\Portable\\apps\\a.exe')
    expect(joinPath('D:\\Portable\\', 'apps\\a.exe')).toBe('D:\\Portable\\apps\\a.exe')
    expect(joinPath('D:\\Portable\\', '\\apps\\a.exe')).toBe('D:\\Portable\\apps\\a.exe')
  })

  it('正斜杠被归一成反斜杠', () => {
    expect(joinPath('D:/Portable', 'apps/a.exe')).toBe('D:\\Portable\\apps\\a.exe')
  })

  it('盘符根目录不会被吃掉分隔符', () => {
    expect(joinPath('D:\\', 'a.exe')).toBe('D:\\a.exe')
  })
})

describe('resolveProjectPath', () => {
  it('绝对路径原样返回', () => {
    const result = resolveProjectPath('C:\\Windows\\notepad.exe')
    expect(result.path).toBe('C:\\Windows\\notepad.exe')
    expect(result.usedRelative).toBe(false)
    expect(result.error).toBeNull()
  })

  it('相对路径 + 基准目录拼成绝对路径', () => {
    const result = resolveProjectPath('apps\\tool.exe', { portableRoot: 'D:\\Portable' })
    expect(result.path).toBe('D:\\Portable\\apps\\tool.exe')
    expect(result.usedRelative).toBe(true)
    expect(result.error).toBeNull()
  })

  it('相对路径但没配基准目录时给出明确错误而不是猜', () => {
    const result = resolveProjectPath('apps\\tool.exe', { portableRoot: null })
    expect(result.error).toBe('no-portable-root')
    expect(result.usedRelative).toBe(true)
  })

  it('相对路径里也能用环境变量', () => {
    const result = resolveProjectPath('%SUB%\\tool.exe', {
      portableRoot: 'D:\\Portable',
      envVars: [{ key: 'SUB', value: 'apps' }]
    })
    expect(result.path).toBe('D:\\Portable\\apps\\tool.exe')
    expect(result.usedEnvKeys).toEqual(['SUB'])
  })

  it('环境变量展开成绝对路径后就不再拼基准目录', () => {
    const result = resolveProjectPath('%ROOT%\\tool.exe', {
      portableRoot: 'D:\\Portable',
      envVars: [{ key: 'ROOT', value: 'E:\\Tools' }]
    })
    expect(result.path).toBe('E:\\Tools\\tool.exe')
    expect(result.usedRelative).toBe(false)
  })

  it('引用了未定义变量时仍返回可用路径并如实上报', () => {
    const result = resolveProjectPath('%NOPE%\\tool.exe', { portableRoot: 'D:\\Portable' })
    expect(result.missingEnvKeys).toEqual(['NOPE'])
    expect(result.error).toBeNull()
  })

  it('空路径返回 empty', () => {
    expect(resolveProjectPath('').error).toBe('empty')
    expect(resolveProjectPath('   ').error).toBe('empty')
  })
})

describe('toPortablePath', () => {
  it('未开启便携优先时保持绝对路径（不擅自改写老用户数据）', () => {
    expect(toPortablePath('D:\\Portable\\a.exe', { portableRoot: 'D:\\Portable' })).toEqual({
      path: 'D:\\Portable\\a.exe',
      relative: false
    })
  })

  it('开启后在基准目录之下时转成相对路径', () => {
    expect(toPortablePath('D:\\Portable\\a.exe', { portableRoot: 'D:\\Portable', preferRelative: true })).toEqual({
      path: 'a.exe',
      relative: true
    })
  })

  it('开启但不在基准目录之下时退回绝对路径', () => {
    expect(toPortablePath('C:\\other\\a.exe', { portableRoot: 'D:\\Portable', preferRelative: true })).toEqual({
      path: 'C:\\other\\a.exe',
      relative: false
    })
  })

  it('空输入返回空', () => {
    expect(toPortablePath('', { preferRelative: true })).toEqual({ path: '', relative: false })
  })
})
