// 临时工具：离屏渲染搜索框玻璃材质预览图
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  try {
    const root = process.cwd()
    const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'src', 'search.css'), 'utf8')
    const workDir = path.join(root, 'build', 'icons')
    fs.mkdirSync(workDir, { recursive: true })
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
      <style>body{width:620px;height:430px;overflow:hidden}#stage{position:absolute;left:10px;top:10px;width:600px}</style></head>
      <body><div id="stage">
      <div class="search-container">
        <div class="search-input-wrapper">
          <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="search-input" placeholder="搜索应用或文件夹...">
        </div>
        <div class="search-results">
          <div class="search-result-item active">
            <div class="search-result-icon"><span class="app-icon">📦</span></div>
            <div class="search-result-info"><div class="search-result-name">Visual Studio Code</div><div class="search-result-path"><span class="search-result-category">编程</span><span>D:\tools\VSCode\Code.exe</span></div></div>
          </div>
          <div class="search-result-item">
            <div class="search-result-icon folder"><span class="app-icon">📁</span></div>
            <div class="search-result-info"><div class="search-result-name">项目文件</div><div class="search-result-path"><span>工作文档</span></div></div>
          </div>
          <div class="search-result-item">
            <div class="search-result-icon action"><span class="app-icon">↻</span></div>
            <div class="search-result-info"><div class="search-result-name">刷新全部图标</div><div class="search-result-path"><span>内置命令</span></div></div>
          </div>
        </div>
      </div></div></body></html>`
    const win = new BrowserWindow({
      show: false, frame: false, transparent: true,
      width: 620, height: 430, useContentSize: true,
      webPreferences: { offscreen: true }
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise(r => setTimeout(r, 500))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 620, height: 430 })
    fs.writeFileSync(path.join(workDir, 'search-preview.png'), image.toPNG())
    console.log('search preview written')
    win.destroy()
    app.quit()
  } catch (error) {
    console.error('failed:', error)
    app.exit(1)
  }
})
