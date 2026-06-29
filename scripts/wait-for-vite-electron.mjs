import { spawn } from 'node:child_process'
import http from 'node:http'

const url = new URL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
const timeoutMs = 30000
const intervalMs = 250
const startedAt = Date.now()

function isReady() {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(res.statusCode && res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForServer() {
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReady()) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out waiting for ${url.href}`)
}

await waitForServer()

const electron = spawn('electron', ['.'], {
  stdio: 'inherit',
  shell: true
})

electron.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
