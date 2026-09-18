# Tidy Desktop（桌面整理）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个简洁高效的桌面应用整理工具，帮助您快速启动、分类和管理应用程序。

## 功能特性

### 核心功能
- **全局快捷键唤醒**：自定义快捷键快速打开/隐藏界面
- **应用管理**：添加、删除、排序、分类管理应用程序
- **智能搜索**：多关键词模糊匹配、拼音首字母、单词前缀、路径搜索
- **分类系统**：多级分类 + 子分类，支持拖拽排序和分组显示
- **图标提取**：自动提取 .exe/.lnk 应用图标并缓存
- **系统托盘**：最小化后驻留在系统托盘，双击可重新打开
- **文件发送**：文档、图片等文件可一键复制到剪贴板，直接粘贴到微信等应用（走 Electron 原生剪贴板，不调用外部命令，瞬时完成）
- **图片拖拽复制**：图片文件可直接拖拽到任意应用（微信、Word、QQ等），或一键复制图片内容到剪贴板粘贴
- **Steam 游戏集成**：拖入 Steam 链接自动获取游戏名和图标

### 搜索功能
- **多关键词搜索**：`vs code` 匹配 `Visual Studio Code`
- **首字母缩写**：`vc` 匹配 `Visual Studio Code`
- **拼音搜索**：`weixin` 或 `wx` 匹配 `微信`
- **文件夹路径**：输入 `C:\Users` 直接打开文件夹

### 搜索引擎（输入关键词 + 空格调用）
| 前缀 | 引擎 |
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

### 分类管理
- 自定义分类（图标、名称）
- 子分类（支持挂在任意分类下或全局）
- 拖拽应用到分类/子分类
- **拖到子分类即可归类**：拖到顶部子分类标签，或拖到网格里的子分类分组上；落点在哪就排在哪，拖到空子分类也会自动留出位置
- 拖拽时跟随鼠标显示**整块卡片**的实时预览（与原卡片等大、跟随主题配色）
- 拖拽排序应用、分类、子分类
- 分类视图中按子分类分组显示
- 无分类时添加应用会提示先创建分类

### 支持的文件类型
- **可执行**：`.exe` `.lnk` `.msi` `.bat` `.cmd` `.vbs` `.ps1` `.com` `.scr` `.appref-ms` `.url`
- **文档 / 文本**：`.pdf` `.doc` `.docx` `.xls` `.xlsx` `.ppt` `.pptx` `.rtf` `.csv` `.txt` `.md` `.markdown` `.html` `.htm` `.json` `.xml` `.yaml` `.yml` `.toml` `.ini` `.conf` `.log`，以及常见代码文件（`.js` `.ts` `.tsx` `.jsx` `.vue` `.py` `.java` `.go` `.rs` `.c` `.cpp` `.cs` `.sql` `.sh` 等）
- **压缩包**：`.zip` `.rar` `.7z` `.tar` `.gz` `.bz2` `.xz` `.tgz` `.iso` `.cab`
- **媒体**：`.mp3` `.mp4` `.wav` `.avi` `.mkv` `.mov` `.flac` `.webm` `.m4a` `.aac` `.ogg` 等
- **图片**：`.jpg` `.jpeg` `.png` `.gif` `.bmp` `.svg` `.webp` `.ico` `.tiff` `.tif` `.heic` `.heif` `.avif` `.psd`（支持复制图片内容或直接拖拽到外部应用）
- **字体**：`.ttf` `.otf` `.woff` `.woff2`

> 完整清单以 `src/shared/utils.ts` 为准：拖入添加、图标提取、复制/拖拽按钮共用同一份白名单，新增类型只需改这一处。

### 设置选项
- 开机自启动
- 自定义快捷键（录制任意组合键）
- UI 自定义（每行数量、卡片大小、圆角、显示/隐藏图标和名称）
- 默认搜索引擎选择

## 技术栈

- Electron 43
- React 18
- TypeScript
- Vite 8
- Tailwind CSS 3
- pinyin-pro（拼音搜索）

## 安装与运行

### 下载安装

从 [GitHub Releases](https://github.com/Wan-Wuan/tidy-desktop/releases) 下载最新版本：
- `tidy-desktop-Setup-x.x.x.exe`：NSIS 安装包，支持自定义安装目录
- `tidy-desktop-v.x.x.x-win-x64.zip`：便携版，解压即用

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发模式
npm run electron:dev
```

### 构建打包

```bash
# 构建前端
npm run build

# 构建主进程
npm run build:main

# 打包为安装包
npx electron-builder --win --x64
```

## 发布流程

`scripts/release.mjs` 会自动完成：升版本号（package.json + lock）、typecheck、测试、打包 NSIS 安装包、生成 SHA256 校验文件、提交 `release: vX.Y.Z` 并打 tag。任何一步失败会回滚版本号。

**前置条件**：

- 发布相关文件（src、package.json 等）必须已提交，工作区干净，否则脚本直接阻断；
- Windows 上默认要求代码签名证书（环境变量 `CSC_LINK`）；本地/测试打包需显式设置 `ALLOW_UNSIGNED_RELEASE=1`；
- 发布 GitHub Release 需要 [gh CLI](https://cli.github.com/) 已登录（`gh auth status`）。

**完整步骤**（以 minor 版本为例，当前 master 分支）：

```bash
# 1. 提交本次改动
git add -A
git commit -m "Feat: ..."
git push origin master

# 2. 升版本 + 验证 + 打包（无签名证书时）
ALLOW_UNSIGNED_RELEASE=1 npm run release -- minor
# 有签名证书时：CSC_LINK=<证书路径或URL> npm run release -- minor

# 3. 推送并创建 GitHub Release
git push origin master
git push origin v2.8.0
gh release create v2.8.0 "release/*2.8.0*" --title "v2.8.0" --notes "Release v2.8.0"
```

版本号规则：`patch` 修 bug、`minor` 新功能、`major` 破坏性变更。同步 Gitee 可用 `npm run publish:gitee`。

## 项目结构

```
tidy-desktop/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主入口
│   │   ├── preload.ts           # 预加载脚本
│   │   ├── config.ts            # 配置管理
│   │   └── handlers/            # IPC 处理器
│   │       ├── appHandlers.ts   # 应用操作
│   │       ├── fileHandlers.ts  # 文件操作
│   │       ├── iconHandlers.ts  # 图标提取
│   │       └── systemHandlers.ts # 系统操作
│   ├── renderer/                # React 渲染进程
│   │   └── src/
│   │       ├── App.tsx          # 主应用组件
│   │       ├── SearchApp.tsx    # 快速搜索框组件
│   │       ├── main.tsx         # 主窗口入口
│   │       ├── search-main.tsx  # 搜索窗口入口
│   │       └── utils/           # 工具函数
│   │           ├── pinyin.ts    # 拼音工具
│   │           ├── fileUtils.ts # 文件工具
│   │           └── iconUtils.ts # 图标工具
│   └── shared/                  # 共享类型和工具
│       ├── types.ts             # TypeScript 接口
│       └── utils.ts             # 共享工具函数
├── electron-builder.yml         # 打包配置
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── vite.config.ts
├── tailwind.config.js
└── postcss.config.js
```

## 数据存储

数据存储在 `%APPDATA%/tidy-desktop/data/` 目录：

- `config.json`：用户配置（快捷键、搜索引擎、UI 设置等）
- `apps.json`：应用列表（含图标缓存）
- `categories.json`：分类和子分类信息
- `icons/`：应用图标缓存目录

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| 自定义（默认 `Alt+Space`） | 显示/隐藏主窗口 |
| 自定义（默认 `Ctrl+K`） | 快速搜索框 |
| `Esc` | 关闭窗口 |
| `Enter` | 打开搜索结果中的第一个应用 |

## 许可证

MIT

## 更新日志

### 未发布（开发中）

**交互修复**
- 修复：浅色主题下卡片悬停的玻璃效果几乎不可见（白叠白），且悬停阴影因 CSS 权重被覆盖而从未生效
- 修复：拖拽悬停与选中态的光圈反馈同样被覆盖，拖拽时看不出落点在哪
- 修复：拖到网格分组区时界面卡死（`dragover` 中高频 setState 导致整网格反复重渲染）
- 修复：跨子分类拖动不归类——原先只挪位置不改归属，应用会"弹回"原分组
- 修复：拖拽中断时预览卡片与空子分类占位块残留在界面上

**可读性**
- 玻璃主题：卡片、子分类标题、顶栏标题等压在深色背景上的文字不再隐形
- 深色主题：补齐缺失的语义色（绿 / 琥珀 / 红 / 品牌）覆盖，深色面板文字对比度达标
- 浅色主题：次要说明文字对比度提升至 WCAG AA

**功能**
- 拖拽时跟随鼠标显示与原卡片等大的**整块预览**（尺寸取实测值，配色跟随主题）
- 拖应用到顶部子分类标签或网格里的子分类分组即可归类，**落点在哪就排在哪**；支持拖到空子分类
- 新增 `.md` `.html` `.json` `.xml` `.yaml` `.log` 等大量文件类型，以及常见代码 / 字体 / 音视频格式
- 复制文件、图片改用 Electron 原生剪贴板，不再拉起 PowerShell，操作瞬时完成
- 复制结果改用轻提示，不再弹出系统对话框

### v1.9.5
- **新增**：自动更新检测 — 启动时自动检查 GitHub 新版本，有新版本时显示更新按钮
- **新增**：一键下载安装 — 点击更新按钮自动下载安装包并静默安装
- **改进**：全新 UI 主题「极光霜冻」— 深靛蓝配色、动态渐变光晕背景、毛玻璃面板
- **改进**：字体升级 — 标题使用 Plus Jakarta Sans，正文使用 Inter
- **改进**：设置面板玻璃拟态化 — 模态框使用毛玻璃效果，圆角更大，阴影更柔和
- **改进**：按钮和交互元素统一使用品牌色系

### v1.9.2
- **安全修复**：PowerShell 命令注入漏洞（改用 EncodedCommand Base64 编码）
- **修复**：搜索无结果时窗口高度不足，提示信息显示不全
- **修复**：搜索框输入时窗口跳动（防抖 + 高度变化检测）
- **修复**：上下键导航逻辑（activeIndex 越界修正）
- **修复**：Escape 键行为（有内容时先清空，无内容时才隐藏）
- **改进**：移除主窗口内搜索框，搜索仅通过快捷键触发
- **改进**：界面全面玻璃拟态化（Inter 字体、Cyan 色系、毛玻璃效果）
- **改进**：Modal 组件 React.memo 优化
- **改进**：子分类按钮点击改为滚动定位

### v1.9.1
- **修复**：点击应用无法打开（`execFile` 改为 `shell.openPath`，支持 `.lnk` 快捷方式）
- **修复**：搜索结果列表无法滚动（移除 `overflow: hidden`）
- **修复**：搜索窗口 resize 时位置跳动（保持窗口顶部位置不变）
- **修复**：新增应用后搜索框无法搜索到（每次显示搜索窗口时刷新数据）

### v1.9.0
- **修复**：搜索框窗口高度与内容不匹配，搜索结果显示不全
- **改进**：搜索结果最多显示 6 条，超出部分可通过上下键滚动浏览
- **改进**：无匹配结果时显示"没有找到匹配的应用或文件夹"提示

### v1.8.7
- **安全修复**：修复 `open-app` 中的命令注入漏洞（`exec()` → `execFile()`）
- **安全修复**：修复 PowerShell 剪贴板和图标提取中的命令注入（`execSync` → `execFileSync`）
- **修复**：添加应用时若已选子分类，新应用自动归入该子分类
- **修复**：添加文件夹时自动归入当前活跃分类（而非空分类）
- **修复**：新建应用/文件夹/Steam 游戏时显式设置 `subcategoryId`，避免类型不一致
- **修复**：全局快捷键注册失败时输出警告日志
- **修复**：搜索窗口失焦检测竞态条件（快速切换窗口时不再误隐藏）
- **改进**：图标提取调用添加 try-catch 防止未处理异常
- **改进**：消除重复的 `getPinyin`/`getFirstLetter` 函数，统一使用工具模块
