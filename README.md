# Tidy Desktop（桌面整理）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个简洁高效的桌面应用整理工具，帮助您快速启动、分类和管理应用程序。

## 功能特性

### 核心功能
- **全局快捷键唤醒**：自定义快捷键快速打开/隐藏界面
- **应用管理**：添加、删除、排序、分类管理应用程序，支持多选批量操作与一键撤销
- **智能搜索**：多关键词模糊匹配、拼音首字母、单词前缀、路径搜索
- **分类系统**：多级分类 + 子分类，支持拖拽排序和分组显示
- **图标提取**：自动提取 .exe/.lnk 应用图标并缓存
- **系统托盘**：最小化后驻留在系统托盘，双击可重新打开
- **自动更新**：内置更新器，从 Gitee（主源）/ GitHub 获取新版本，下载后校验 SHA256 再静默安装
- **失焦自动隐藏**：切到其它应用时主窗口与搜索窗口自动收起，两个窗口可分别开关
- **五套主题 / 三种布局**：极光、浅色、深色、跟随系统、玻璃主题；`command-rail`、`horizon-workspace`、`studio-split` 三种界面布局，另可自定义强调色
- **数据安全**：写入走临时文件 + 原子替换，每日自动备份，损坏文件自动隔离保留
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
- 开机自启动 / 启动时最小化到托盘
- 自定义快捷键（主窗口与搜索窗口分别录制）
- 关闭行为（最小化到托盘 / 直接退出）
- 界面布局与主题（含强调色）
- UI 自定义（每行数量、卡片大小、圆角、显示/隐藏图标和名称）
- 排序方式（手动 / 名称 / 启动次数 / 最近使用）
- 搜索窗口（宽度、垂直位置、最大结果数、透明度、提示开关）
- 失焦自动隐藏（主窗口与搜索窗口分别开关）
- 默认搜索引擎、自动分类规则

## 技术栈

- Electron 43
- React 18
- TypeScript 5
- Vite 8
- Tailwind CSS 3
- electron-builder 26（打包）
- Vitest 4（单元测试）
- pinyin-pro（拼音搜索）

## 安装与运行

### 下载安装

从 **[Gitee Releases](https://gitee.com/wanwuan/tidy_desktop/releases)**（国内推荐，也是应用内更新检测的主源）
或 [GitHub Releases](https://github.com/Wan-Wuan/tidy-desktop/releases) 下载最新版本：

- `tidy-desktop-Setup-x.x.x.exe`：NSIS 安装包，支持自定义安装目录
- `tidy-desktop-Setup-x.x.x.exe.sha256`：安装包 SHA256 校验文件，应用内更新会用它校验下载完整性

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
git push origin v2.9.2
gh release create v2.9.2 "release/*2.9.2*" --title "v2.9.2" --notes-file release/notes-v2.9.2.md
```

版本号规则：`patch` 修 bug、`minor` 新功能、`major` 破坏性变更。

**Gitee 镜像**：安装包用 `npm run publish:gitee` 上传（需 `GITEE_TOKEN`，勾 `projects` 权限）；
Release 说明与仓库描述用 `GITEE_TOKEN=<令牌> node scripts/sync-gitee-metadata.mjs` 从 GitHub 同步。
顺序上要先推代码与 tag，再发 Release —— `publish:gitee` 用 `master` 作 `target_commitish`，
master 落后时自动创建的 tag 会指向错误的提交。

## 项目结构

```
tidy-desktop/
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts              # 主入口：窗口 / 托盘 / 快捷键 / 单实例锁
│   │   ├── preload.ts            # 预加载脚本（唯一的渲染层 API 面）
│   │   ├── config.ts             # 配置管理
│   │   ├── blurAutoHide.ts       # 失焦自动隐藏（两个窗口共用）
│   │   ├── dialogGuard.ts        # 原生对话框守卫
│   │   ├── backup.ts             # 每日自动备份
│   │   ├── jsonTransaction.ts    # JSON 原子写入与崩溃恢复
│   │   ├── validation.ts         # 入参校验
│   │   ├── urlPolicy.ts          # 外链白名单
│   │   ├── ipcGuard.ts           # IPC 调用方校验
│   │   ├── handlers/             # IPC 处理器
│   │   │   ├── appHandlers.ts    # 应用操作
│   │   │   ├── fileHandlers.ts   # 文件操作
│   │   │   ├── iconHandlers.ts   # 图标提取
│   │   │   └── systemHandlers.ts # 系统操作
│   │   └── update/               # 自研更新器（检测 / 下载 / 校验 / 安装助手）
│   ├── renderer/                 # React 渲染进程
│   │   └── src/
│   │       ├── App.tsx           # 主应用组件
│   │       ├── SearchApp.tsx     # 快速搜索框组件
│   │       ├── main.tsx          # 主窗口入口
│   │       ├── search-main.tsx   # 搜索窗口入口
│   │       ├── components/       # AppCard / CategoryNav / ToastStack / modals 等
│   │       ├── hooks/            # useAppData / useDragAndDrop / useUpdate 等
│   │       └── utils/            # 拼音、文件、图标、持久化工具
│   └── shared/                   # 共享类型和工具
│       ├── types.ts              # TypeScript 接口
│       └── utils.ts              # 共享工具函数
├── electron-builder.yml          # 打包配置
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

完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)，当前版本 **v2.9.2**。
