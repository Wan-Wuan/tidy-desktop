/* 端到端验证「用端口连本机 Everything」这条路真的通：
   起一个本地 HTTP 服务冒充 Everything 的 JSON 接口，跑真实的 searchEverything。
   纯函数测试覆盖不到 URL 拼装、认证头、非 2xx 处理——而这几处正是之前坏掉的地方。 */
import http from 'http'
import path from 'path'
import { describe, it, expect, afterEach } from 'vitest'
import { searchEverything, isEverythingReachable } from './fileSearch'

let server: http.Server | null = null

async function startServer(handler: http.RequestListener): Promise<number> {
  const s = http.createServer(handler)
  server = s
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve))
  const addr = s.address()
  if (addr === null || typeof addr === 'string') throw new Error('无法取得监听端口')
  return addr.port
}

afterEach(async () => {
  const s = server
  server = null
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()))
})

describe('searchEverything（对接 Everything JSON 接口）', () => {
  it('请求显式带 path_column / attributes_column，并正确拼出完整路径', async () => {
    const requests: string[] = []
    const port = await startServer((req, res) => {
      requests.push(req.url || '')
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          totalResults: 3,
          results: [
            { type: 'file', name: 'report.txt', path: 'C:\\Users\\me\\Documents', size: 1234, attributes: 32 },
            { type: 'folder', name: 'reports', path: 'D:\\work', size: 0, attributes: 16 },
            { type: 'file', name: 'report.txt', path: 'E:\\backup', size: 99, attributes: 32 }
          ]
        })
      )
    })

    const out = await searchEverything(port, 'report', 50)

    // 多磁盘同名文件必须都在
    expect(out).toHaveLength(3)
    const paths = out.map((r) => r.path)
    expect(paths).toContain(path.join('C:\\Users\\me\\Documents', 'report.txt'))
    expect(paths).toContain(path.join('E:\\backup', 'report.txt'))

    // 文件夹被识别，且路径是「目录 + 名」
    const folder = out.find((r) => r.isDir)
    expect(folder?.name).toBe('reports')
    expect(folder?.path).toBe(path.join('D:\\work', 'reports'))

    // 请求必须带这些列——Everything 默认 path_column=0，不带就完全不返回 path
    const url = requests[0] || ''
    expect(url).toContain('json=1')
    expect(url).toContain('path_column=1')
    expect(url).toContain('attributes_column=1')
    expect(url).toContain('size_column=1')
  })

  it('返回 401 时抛错（由调用方降级），可达性探测也判为不可用', async () => {
    const port = await startServer((_req, res) => {
      res.statusCode = 401
      res.end('unauthorized')
    })
    await expect(searchEverything(port, 'x', 10)).rejects.toThrow()
    expect(await isEverythingReachable(port)).toBe(false)
  })

  it('设置了用户名密码时携带 Basic Auth 才能连上', async () => {
    const expected = `Basic ${Buffer.from('admin:secret', 'utf-8').toString('base64')}`
    const port = await startServer((req, res) => {
      if (req.headers.authorization !== expected) {
        res.statusCode = 401
        res.end('no')
        return
      }
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify([{ type: 'file', name: 'a.txt', path: 'C:\\x' }]))
    })

    expect(await isEverythingReachable(port, 400, { username: 'admin', password: 'secret' })).toBe(true)
    const out = await searchEverything(port, 'a', 10, { auth: { username: 'admin', password: 'secret' } })
    expect(out).toHaveLength(1)
    expect(out[0].path).toBe(path.join('C:\\x', 'a.txt'))
  })

  it('端口不可达时抛错，不静默返回空', async () => {
    // 用一个几乎不可能被占用的高端口
    await expect(searchEverything(9, 'x', 10, { timeoutMs: 300 })).rejects.toThrow()
  })
})
