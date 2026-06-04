# Tidy Desktop

桌面整理应用 — 高效管理你的桌面快捷方式与应用

![Version](https://img.shields.io/badge/version-1.6.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-lightgrey)
![Electron](https://img.shields.io/badge/Electron-28-47848F)
![React](https://img.shields.io/badge/React-18-61DAFB)

---

## 功能特性

### 核心功能
- **桌面快捷方式整理** — 将应用/文件夹/URL 按分类组织到网格中
- **快速搜索** — 按名称、拼音、首字母即时搜索应用
- **智能拼音匹配** — 支持全拼/首字母模糊搜索（如 `vs code` → Visual Studio Code）
- **快捷引擎搜索** — 内置 Bing/Google/百度 等多个搜索引擎，输入 `g xxx` 快速搜索
- **拖拽整理** — 拖拽调整应用顺序，跨分类移动
- **全局快捷键** — `Alt+Space` 切换主窗口，`Ctrl+K` 打开快速搜索

### v1.6.1 新增
- **Steam 游戏支持** 🎮 — 添加 `steam://` 链接作为快捷方式，自动提取游戏图标
- **应用编辑功能** ✎ — 悬停显示编辑按钮，可修改名称/路径/类型/分类
- **Steam 图标提取** — 自动从 Steam 缓存目录读取游戏图标并展示
- **批量图标加载** — 启动时批量补全缺失的应用图标

### 支持的文件类型
- **可执行文件**：`.exe` `.lnk` `.msi` `.bat` `.cmd` `.vbs` `.ps1`
- **文档**：`.ppt` `.pptx` `.doc` `.docx` `.xls` `.xlsx` `.pdf` `.txt` `.rtf` `.csv`
- **压缩包**：`.zip` `.rar` `.7z` `.tar` `.gz` `.bz2`
- **媒体文件**：`.mp3` `.mp4` `.wav` `.avi` `.mkv` `.jpg` `.png` `.gif` `.svg`

### Steam 链接支持
- `steam://launch/<AppID>` — 直接启动游戏
- `steam://rungameid/<AppID>` — 备选启动协议
- `https://store.steampowered.com/app/<AppID>` — 商店链接（自动转换）

### 快捷键
| 快捷键 | 功能 |
|--------|------|
| `Alt+Space` | 显示/隐藏主窗口 |
| `Ctrl+K` | 打开快速搜索 |
| `Esc` | 关闭弹窗/隐藏窗口 |

### 搜索引擎快捷指令
| 指令 | 引擎 |
|------|------|
| `b` | Bing |
| `g` | Google |
| `bd` | 百度 |
| `yh` | Yahoo |
| `ddg` | DuckDuckGo |
| `gh` | GitHub |
| `so` | StackOverflow |
| `zhihu` | 知乎 |
| `bilibili` | B站 |

## 下载安装

### 最新版本
从 [GitHub Releases](https://github.com/Wan-Wuan/tidy-desktop/releases) 下载最新安装包：
- `tidy-desktop Setup x.x.x.exe` — NSIS 安装程序，直接运行安装

### 从源码构建

```bash
# 安装依赖
npm install

# 开发模式
npm run electron:dev

# 生产构建（生成 exe 安装包）
npm run electron:build
```

## 项目结构

```
tidy-desktop/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主入口 + IPC 处理器
│   │   └── preload.ts           # 预加载桥接
│   ├── renderer/                # React 渲染进程
│   │   └── src/
│   │       ├── App.tsx          # 主窗口
│   │       ├── SearchApp.tsx    # 快速搜索窗口
│   │       ├── main.tsx         # 入口
│   │       └── search-main.tsx  # 搜索窗口入口
│   └── shared/                  # 共享类型定义
│       └── types.ts
├── build/                       # 图标资源
├── electron-builder.yml         # 打包配置
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## 数据存储

应用数据存储在 `%APPDATA%/tidy-desktop/data/` 目录：

- `config.json` — 窗口大小、快捷键、UI 设置
- `apps.json` — 所有应用列表
- `categories.json` — 分类配置
- `icons/` — 缓存的图标文件

## 技术栈

- **Electron 28** — 桌面框架
- **React 18** — UI 框架
- **TypeScript** — 类型安全
- **Vite 5** — 构建工具
- **Tailwind CSS 3** — 样式框架
- **electron-builder 24** — 打包工具
- **pinyin-pro** — 中文拼音匹配

## 许可证

[MIT License](LICENSE)
