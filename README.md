# Tidy Desktop（桌面整理）

一个简洁高效的桌面应用整理工具，帮助您快速启动、分类和管理应用程序。

## 功能特性

### 核心功能
- **全局快捷键唤醒**：自定义快捷键快速打开/隐藏界面
- **应用管理**：添加、删除、排序、分类管理应用程序
- **智能搜索**：多关键词模糊匹配、拼音首字母、单词前缀、路径搜索
- **分类系统**：多级分类 + 子分类，支持拖拽排序和分组显示
- **图标提取**：自动提取 .exe/.lnk 应用图标并缓存
- **系统托盘**：最小化后驻留在系统托盘，双击可重新打开

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
- 拖拽排序应用、分类、子分类
- 分类视图中按子分类分组显示
- 无分类时添加应用会提示先创建分类

### 支持的文件类型
- **可执行**：`.exe` `.lnk` `.msi` `.bat` `.cmd` `.vbs` `.ps1`
- **文档**：`.ppt` `.pptx` `.doc` `.docx` `.xls` `.xlsx` `.pdf` `.txt` `.rtf` `.csv`
- **压缩包**：`.zip` `.rar` `.7z` `.tar` `.gz` `.bz2`
- **媒体**：`.mp3` `.mp4` `.wav` `.avi` `.mkv` `.jpg` `.png` `.gif` `.svg`

### 设置选项
- 开机自启动
- 自定义快捷键（录制任意组合键）
- UI 自定义（每行数量、卡片大小、圆角、显示/隐藏图标和名称）
- 默认搜索引擎选择

## 技术栈

- Electron 28
- React 18
- TypeScript
- Vite 5
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

## 项目结构

```
tidy-desktop/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主入口（IPC、窗口管理、图标提取）
│   │   └── preload.ts           # 预加载脚本
│   ├── renderer/                # React 渲染进程
│   │   └── src/
│   │       ├── App.tsx          # 主应用组件
│   │       ├── SearchApp.tsx    # 快速搜索框组件
│   │       ├── main.tsx         # 主窗口入口
│   │       ├── search-main.tsx  # 搜索窗口入口
│   │       └── index.css        # 全局样式
│   └── shared/                  # 共享类型定义
│       └── types.ts
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
