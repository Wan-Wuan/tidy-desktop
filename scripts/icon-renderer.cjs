// 由 generate-icons.mjs 调用：离屏渲染 SVG 母版并输出各尺寸 PNG
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  try {
    const root = process.cwd()
    const svgPath = path.join(root, 'build', 'app-icon.svg')
    const workDir = path.join(root, 'build', 'icons')
    fs.rmSync(workDir, { recursive: true, force: true })
    fs.mkdirSync(workDir, { recursive: true })

    const win = new BrowserWindow({
      show: false,
      frame: false,
      transparent: true,
      width: 512,
      height: 512,
      useContentSize: true,
      webPreferences: { offscreen: true }
    })
    const svgData = fs.readFileSync(svgPath, 'utf8')
    await win.loadURL('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData))

    const image = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        win.webContents.stopPainting()
        reject(new Error('paint timeout'))
      }, 10000)
      win.webContents.on('paint', (_event, _dirty, image) => {
        if (image.isEmpty()) return
        const size = image.getSize()
        if (size.width !== 512 || size.height !== 512) return
        clearTimeout(timeout)
        win.webContents.stopPainting()
        resolve(image)
      })
      // offscreen 渲染在 loadURL 后自动开始；确认处于绘制状态
      if (!win.webContents.isPainting()) win.webContents.invalidate()
    })

    fs.writeFileSync(path.join(workDir, 'icon-512.png'), image.toPNG())
    for (const size of [16, 24, 32, 48, 64, 128, 256]) {
      const resized = image.resize({ width: size, height: size, quality: 'best' })
      fs.writeFileSync(path.join(workDir, 'icon-' + size + '.png'), resized.toPNG())
    }
    console.log('[renderer] all sizes written')
    win.destroy()
    app.quit()
  } catch (error) {
    console.error('[renderer] failed:', error)
    app.exit(1)
  }
})
