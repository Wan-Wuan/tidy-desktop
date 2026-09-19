/**
 * design-qa 用的模板截图工具：用**真实主窗口**在 1440×1024 下逐模板出图。
 *
 * 为什么需要它：design-qa.md 长期停在 `blocked`——本机没有 Playwright/Puppeteer，
 * 而三套模板在真实窗口里的渲染效果才是要比对的对象。Electron 自带的
 * `webContents.capturePage()` 不需要任何额外依赖，正好补上这个缺口。
 *
 * 隔离性：数据目录被重定向到仓库内的 `.layout-qa/ud-<模板>/`，
 * **不会读写用户的真实数据**（`%APPDATA%\tidy-desktop`）。每次用独立目录，
 * 刻意不删旧目录——本机 fs.rmSync(recursive) 有挂死的记录。
 *
 * 用法（需先 `npm run build` + `npm run build:main`，应用必须未在运行）：
 *   node_modules\electron\dist\electron.exe scripts\layout-qa-capture.cjs --layout=command-rail
 * 产物：build/layout-qa/<模板>.png
 *
 * ⚠️ 状态：**未验证**。2026-09-19 在自动化环境里试跑时，`require('electron')` 拿到的是
 * node_modules/electron 导出的可执行文件路径（而非主进程 API），改成目录式应用启动也
 * 没能跑起来，且 GUI 进程的 stdout/stderr 抓不到，看不到真正原因。这里保留脚本是因为
 * 思路（隔离 userData + capturePage）本身可行，**在真实终端里运行**才能看到失败细节。
 * 详见 design-qa.md 的 2026-09-19 一节。
 */
/* 取 Electron 主进程 API。
   ⚠️ 直接 `require('electron')` 在本仓库里拿到的是**可执行文件路径字符串**——
   因为从项目目录运行时，Node 先解析到了 node_modules/electron/index.js
   （那个包只为第三方工具导出路径），而不是 Electron 运行时的内置模块。
   依次回退：electron/main → js2c 内部模块。 */
const loadElectronApi = () => {
  const candidates = ['electron/main', 'electron/js2c/browser_init', 'electron']
  for (const name of candidates) {
    try {
      const mod = require(name)
      if (mod && typeof mod === 'object' && mod.app && mod.BrowserWindow) return mod
    } catch { /* 换下一个 */ }
  }
  throw new Error('无法获取 Electron 主进程 API（app/BrowserWindow 均为空）')
}

const { app, BrowserWindow } = loadElectronApi()
const path = require('path')
const fs = require('fs')

const root = process.cwd()
const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const layout = arg('layout', 'horizon-workspace')
const theme = arg('theme', 'glass')
const outName = arg('out', layout)

const userData = path.join(root, '.layout-qa', `ud-${outName}`)
const dataDir = path.join(userData, 'data')
fs.mkdirSync(dataDir, { recursive: true })

const write = (file, obj) =>
  fs.writeFileSync(path.join(dataDir, file), JSON.stringify(obj, null, 2), 'utf8')

/* 样例数据：只为让网格、分类栏、子分类栏都有内容，名称用中文以贴近真实排版。
   icon 留空 → 卡片显示首字母占位块；本工具校验的是布局与排版，不是图标本身。 */
const cats = [
  { id: 'c-dev', name: '编程开发', icon: '💻', order: 0 },
  { id: 'c-tool', name: '常用工具', icon: '🧰', order: 1 },
  { id: 'c-media', name: '影音娱乐', icon: '🎬', order: 2 }
]
const subs = [
  { id: 's-editor', name: '编辑器', icon: '📝', parentId: 'c-dev', order: 0 },
  { id: 's-terminal', name: '终端', icon: '⌨️', parentId: 'c-dev', order: 1 },
  { id: 's-capture', name: '截图录屏', icon: '📸', parentId: 'c-tool', order: 0 }
]
const names = [
  ['Visual Studio Code', 'c-dev', 's-editor'], ['WebStorm', 'c-dev', 's-editor'],
  ['Sublime Text', 'c-dev', 's-editor'], ['Windows Terminal', 'c-dev', 's-terminal'],
  ['Git Bash', 'c-dev', 's-terminal'], ['PowerShell', 'c-dev', 's-terminal'],
  ['Snipaste', 'c-tool', 's-capture'], ['ShareX', 'c-tool', 's-capture'],
  ['Everything', 'c-tool', null], ['7-Zip', 'c-tool', null],
  ['PotPlayer', 'c-media', null], ['Spotify', 'c-media', null],
  ['OBS Studio', 'c-media', null], ['网易云音乐', 'c-media', null]
]
const apps = names.map(([name, categoryId, subcategoryId], i) => ({
  id: `demo-${i}`,
  name,
  path: `C:\\Program Files\\Demo\\${name}.exe`,
  icon: '',
  categoryId,
  subcategoryId,
  pinyin: '',
  firstLetter: name[0],
  type: 'app'
}))

write('config.json', {
  onboardingCompleted: true,
  startMinimizedToTray: false,
  closeAction: 'quit',
  ui: { layout, theme, gridColumns: 6, cardSize: 'medium', toolbarIconOnly: false }
})
write('apps.json', { apps })
write('categories.json', { categories: cats, subcategories: subs })

// 必须在 require 主进程之前重定向：config.ts 在模块加载时就按 userData 算路径
app.setPath('userData', userData)

const outDir = path.join(root, 'build', 'layout-qa')
let done = false

const fail = (msg) => {
  console.error('[layout-qa] ' + msg)
  fs.writeFileSync(path.join(root, '.layout-qa', 'error.txt'), msg, 'utf8')
  app.exit(1)
}

setTimeout(() => { if (!done) fail('超过 20 秒没有等到主窗口加载完成') }, 20000)

app.on('browser-window-created', (_event, win) => {
  // 应用还会创建一个搜索窗（search.html）——只截主窗口
  win.webContents.on('did-finish-load', async () => {
    const url = win.webContents.getURL()
    if (url.includes('search.html') || done) return
    done = true
    try {
      win.setContentSize(1440, 1024)
      // 等极光背景、毛玻璃与入场动画稳定下来（stagger-enter 等）
      await new Promise(r => setTimeout(r, 1500))
      const image = await win.webContents.capturePage()
      fs.mkdirSync(outDir, { recursive: true })
      const out = path.join(outDir, `${outName}.png`)
      fs.writeFileSync(out, image.toPNG())
      const size = image.getSize()
      fs.writeFileSync(path.join(root, '.layout-qa', 'result.txt'),
        `${outName}: ${size.width}x${size.height} -> ${out}\n`, 'utf8')
      app.exit(0)
    } catch (error) {
      fail('截图失败: ' + (error && error.message))
    }
  })
})

try {
  require(path.join(root, 'dist', 'main', 'main', 'index.js'))
} catch (error) {
  fail('主进程加载失败: ' + (error && error.message))
}
