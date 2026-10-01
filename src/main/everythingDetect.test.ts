import { describe, it, expect } from 'vitest'
import {
  candidatePorts,
  mergeIniCandidates,
  parseEverythingIni,
  resolveEverythingPort,
  portFromIni,
  httpEnabledFromIni,
  EVERYTHING_DEFAULT_HTTP_PORT,
  type EverythingDetection
} from './everythingDetect'

describe('parseEverythingIni', () => {
  it('解析 HTTP 服务开关与端口', () => {
    const s = parseEverythingIni(
      ['[Everything]', 'http_server_enabled=1', 'http_server_port=8080'].join('\n')
    )
    expect(s.httpServerEnabled).toBe(true)
    expect(s.httpServerPort).toBe(8080)
  })

  it('allow_http_server=0 记为 false', () => {
    expect(parseEverythingIni('allow_http_server=0').allowHttpServer).toBe(false)
    expect(parseEverythingIni('allow_http_server=1').allowHttpServer).toBe(true)
  })

  it('解析用户名与密码', () => {
    const s = parseEverythingIni('http_server_username=admin\nhttp_server_password=secret')
    expect(s.username).toBe('admin')
    expect(s.password).toBe('secret')
  })

  it('忽略注释、空行与节名，键名大小写不敏感', () => {
    const s = parseEverythingIni(
      ['; comment', '# another', '', '[Everything]', 'HTTP_SERVER_ENABLED = 1'].join('\n')
    )
    expect(s.httpServerEnabled).toBe(true)
  })

  it('非法 / 越界端口被忽略', () => {
    expect(parseEverythingIni('http_server_port=0').httpServerPort).toBeUndefined()
    expect(parseEverythingIni('http_server_port=99999').httpServerPort).toBeUndefined()
    expect(parseEverythingIni('http_server_port=abc').httpServerPort).toBeUndefined()
  })

  it('无关键不产生字段', () => {
    const s = parseEverythingIni('some_other_setting=42')
    expect(s).toEqual({})
  })
})

describe('portFromIni', () => {
  it('显式端口优先', () => {
    expect(portFromIni({ httpServerEnabled: true, httpServerPort: 9090 })).toBe(9090)
  })

  it('启用但未写端口 → Everything 默认端口 80', () => {
    expect(portFromIni({ httpServerEnabled: true })).toBe(EVERYTHING_DEFAULT_HTTP_PORT)
  })

  it('未启用 → undefined', () => {
    expect(portFromIni({})).toBeUndefined()
    expect(portFromIni({ httpServerEnabled: false, httpServerPort: 8080 })).toBeUndefined()
  })
})

describe('httpEnabledFromIni', () => {
  it('enabled=1 且未禁 allow → true', () => {
    expect(httpEnabledFromIni({ httpServerEnabled: true })).toBe(true)
  })

  it('allow_http_server=0 → false', () => {
    expect(httpEnabledFromIni({ httpServerEnabled: true, allowHttpServer: false })).toBe(false)
  })

  it('未启用 / 缺省 → false', () => {
    expect(httpEnabledFromIni({})).toBe(false)
    expect(httpEnabledFromIni({ httpServerEnabled: false })).toBe(false)
  })
})

describe('resolveEverythingPort', () => {
  const enabled: EverythingDetection = {
    installed: true,
    running: true,
    httpEnabled: true,
    port: 8080
  }

  it('显式配置优先于自动检测', () => {
    expect(resolveEverythingPort(1234, enabled)).toBe(1234)
  })

  it('未显式配置时用自动检测端口', () => {
    expect(resolveEverythingPort(0, enabled)).toBe(8080)
  })

  it('检测到装了但 HTTP 未启用 → 0（无法搜索）', () => {
    const disabled: EverythingDetection = {
      installed: true,
      running: false,
      httpEnabled: false,
      port: 8080
    }
    expect(resolveEverythingPort(0, disabled)).toBe(0)
  })

  it('没有检测结果 / 未安装 → 0', () => {
    expect(resolveEverythingPort(0, null)).toBe(0)
    expect(resolveEverythingPort(0, undefined)).toBe(0)
  })
})

describe('mergeIniCandidates', () => {
  it('取 mtime 最新的那份的设置（安装目录 ini 覆盖 %APPDATA% 里的陈旧残留）', () => {
    const out = mergeIniCandidates([
      { file: 'C:/Users/x/AppData/Roaming/Everything/Everything.ini', mtime: 1000, settings: { httpServerEnabled: false } },
      { file: 'D:/Program Files (x86)/Everything/Everything.ini', mtime: 9_000_000, settings: { httpServerEnabled: true, httpServerPort: 80 } }
    ])
    expect(out.settings.httpServerEnabled).toBe(true)
    expect(out.settings.httpServerPort).toBe(80)
    expect(out.iniPath).toBe('D:/Program Files (x86)/Everything/Everything.ini')
  })

  it('新 ini 没定义的键回退到旧 ini（逐键取值）', () => {
    const out = mergeIniCandidates([
      { file: 'old.ini', mtime: 1000, settings: { allowHttpServer: true, httpServerPort: 8080 } },
      { file: 'new.ini', mtime: 2000, settings: { httpServerEnabled: true } }
    ])
    expect(out.settings.httpServerEnabled).toBe(true)
    expect(out.settings.httpServerPort).toBe(8080)
    expect(out.settings.allowHttpServer).toBe(true)
  })

  it('空输入返回空设置', () => {
    expect(mergeIniCandidates([])).toEqual({ settings: {} })
  })

  it('端到端：陈旧 ini 说未启用、新 ini 说已启用 → 结果应为已启用', () => {
    const stale = parseEverythingIni('http_server_enabled=0\nhttp_server_port=80')
    const active = parseEverythingIni('allow_http_server=1\nhttp_server_enabled=1\nhttp_server_port=80')
    const { settings } = mergeIniCandidates([
      { file: 'appdata.ini', mtime: 100, settings: stale },
      { file: 'install.ini', mtime: 200, settings: active }
    ])
    expect(httpEnabledFromIni(settings)).toBe(true)
    expect(portFromIni(settings)).toBe(80)
  })
})

describe('candidatePorts', () => {
  it('显式配置时只返回该端口', () => {
    expect(candidatePorts(9000, { installed: true, httpEnabled: true, port: 8080 })).toEqual([9000])
  })

  it('无显式配置时：ini 端口在前，然后是默认 80 与 8080', () => {
    const out = candidatePorts(0, { installed: true, httpEnabled: true, port: 8080 })
    expect(out[0]).toBe(8080)
    expect(out).toContain(EVERYTHING_DEFAULT_HTTP_PORT)
  })

  it('ini 未给出端口时也能回退到默认端口（Everything 运行期可能还没把设置写回 ini）', () => {
    const out = candidatePorts(0, { installed: true, httpEnabled: false })
    expect(out).toContain(EVERYTHING_DEFAULT_HTTP_PORT)
  })

  it('去重，且不产生非法端口', () => {
    const out = candidatePorts(0, { installed: true, httpEnabled: true, port: EVERYTHING_DEFAULT_HTTP_PORT })
    expect(new Set(out).size).toBe(out.length)
    expect(out.every((p) => p > 0 && p <= 65535)).toBe(true)
  })

  it('没有检测信息时仍有默认候选', () => {
    expect(candidatePorts(0, null).length).toBeGreaterThan(0)
  })
})
