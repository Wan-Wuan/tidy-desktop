// 临时工具：离屏渲染主界面玻璃材质预览图（使用构建后的完整 CSS）
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.whenReady().then(async () => {
  try {
    const root = process.cwd()
    const assetsDir = path.join(root, 'dist', 'renderer', 'assets')
    const cssFile = fs.readdirSync(assetsDir).filter(f => f.startsWith('main-') && f.endsWith('.css'))[0]
    const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8')
    const themeClass = 'theme-' + (process.argv[2] || 'dark')
    const outFile = path.join(root, 'build', 'icons', 'main-preview-' + (process.argv[2] || 'dark') + '.png')

    const tile = (color) => '<div class="app-tile glass-card card-hover" style="height:120px"><div style="width:48px;height:48px;border-radius:14px;background:' + color + ';margin:8px auto 0"></div><p style="text-align:center;font-size:12px;color:rgb(var(--slate-600));margin-top:10px">应用</p></div>'
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
      body{width:900px;height:640px;overflow:hidden}
      .mock-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:4px 20px}
      .mock-pills{display:flex;gap:8px;padding:10px 20px}
      .mock-pill{padding:5px 14px;border-radius:999px;font-size:12px}
    </style></head><body>
    <div class="app-shell ${themeClass}" style="width:900px;height:640px">
      <div class="aurora-bg">
        <div class="aurora-orb aurora-orb--indigo"></div>
        <div class="aurora-orb aurora-orb--frost"></div>
        <div class="aurora-orb aurora-orb--violet"></div>
        <div class="aurora-orb aurora-orb--amber"></div>
        <div class="aurora-orb aurora-orb--rose"></div>
      </div>
      <header class="app-header glass" style="margin:12px 16px 0;border-radius:18px;padding:14px 20px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <img src="file:///${root.split('\\').join('/')}/public/favicon.svg" width="30" height="30" style="border-radius:8px">
          <strong style="font-size:16px">Tidy Desktop</strong>
        </div>
        <div class="header-actions-group ${process.argv[3] === 'icon' ? 'header-actions-icon-only' : ''}">
          <span class="header-action"><b>+</b><span>添加应用</span></span>
          <span class="header-action"><span>添加文件夹</span></span>
          <span class="header-action"><span>整理中心</span></span>
          <span class="header-action"><span>设置</span></span>
        </div>
      </header>
      <div class="category-nav mock-pills">
        <span class="mock-pill" style="background:rgb(var(--brand-600));color:#fff">全部</span>
        <span class="mock-pill" style="background:rgba(255,255,255,.6)">编程</span>
        <span class="mock-pill" style="background:rgba(255,255,255,.6)">娱乐</span>
        <span class="mock-pill" style="background:rgba(255,255,255,.6)">工具</span>
      </div>
      <main class="app-content" style="padding:12px 20px">
        <div class="mock-grid">
          ${tile('linear-gradient(135deg,#FF8578,#E8483C)')}
          ${tile('linear-gradient(135deg,#74B9FF,#2F7BFF)')}
          ${tile('linear-gradient(135deg,#55DCCB,#18A995)')}
          ${tile('linear-gradient(135deg,#FFD666,#F2A419)')}
          ${tile('linear-gradient(135deg,#B78CFF,#8146E8)')}
          ${tile('linear-gradient(135deg,#FF8FC5,#E8469C)')}
        </div>
      </main>
      <footer class="app-footer glass" style="margin:0 16px 10px;border-radius:14px;padding:8px 20px;font-size:11px">Esc 关闭窗口</footer>
    </div></body></html>`

    const win = new BrowserWindow({
      show: false, frame: false, width: 900, height: 640, useContentSize: true,
      webPreferences: { offscreen: true }
    })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await new Promise(r => setTimeout(r, 700))
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: 900, height: 640 })
    fs.writeFileSync(outFile, image.toPNG())
    console.log('main preview written:', path.basename(outFile))
    win.destroy()
    app.quit()
  } catch (error) {
    console.error('failed:', error)
    app.exit(1)
  }
})
