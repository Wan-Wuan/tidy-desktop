# 桌面整理 (Tidy Desktop)

一个简洁高效的桌面应用整理工具，帮助您快速启动和管理应用程序。

## 功能特性

- **全局快捷键唤醒**：支持 `Ctrl+Space` 或 `Alt+Space` 快速打开/隐藏界面
- **应用管理**：添加、删除、分类管理您的应用程序
- **智能搜索**：
  - 全字母搜索：输入应用名称的任意部分
  - 首字母搜索：输入拼音首字母快速定位
- **搜索引擎集成**：
  - 输入 `b + 空格 + 关键词` 调用 Bing 搜索
  - 输入 `g + 空格 + 关键词` 调用 Google 搜索
- **分类管理**：预设多种分类（浏览器、开发工具、影音娱乐等），支持自定义
- **无边框网格布局**：清爽的应用展示界面
- **系统托盘**：最小化后驻留在系统托盘，双击可重新打开

## 技术栈

- Electron 28
- React 18
- TypeScript
- Vite
- Tailwind CSS
- pinyin-pro（拼音搜索支持）

## 安装与运行

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发模式（同时启动Vite和Electron）
npm run electron:dev
```

### 构建打包

```bash
# 构建生产版本
npm run electron:build
```

## 项目结构

```
tidy-desktop/
├── src/
│   ├── main/                    # Electron主进程
│   │   ├── index.ts             # 主入口
│   │   └── preload.ts           # 预加载脚本
│   ├── renderer/                # React渲染进程
│   │   └── src/
│   │       ├── App.tsx          # 主应用组件
│   │       ├── main.tsx         # 渲染入口
│   │       └── index.css        # 全局样式
│   └── shared/                  # 共享类型定义
│       └── types.ts
├── data/                        # 数据目录（运行时自动生成）
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── vite.config.ts
└── tailwind.config.js
```

## 数据存储

应用数据存储在用户的Electron应用数据目录中：

- `config.json`：用户配置（快捷键、搜索引擎等）
- `apps.json`：应用列表
- `categories.json`：分类信息

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Space` 或 `Alt+Space` | 显示/隐藏主窗口（可在设置中切换） |
| `Enter` | 打开搜索结果中的第一个应用 |

## 搜索技巧

- 直接输入应用名称进行搜索
- 输入拼音或拼音首字母进行搜索
- 输入 `b 关键词` 使用 Bing 搜索
- 输入 `g 关键词` 使用 Google 搜索

## 默认分类

- 🌐 浏览器
- 💻 开发工具
- 🎬 影音娱乐
- 📄 办公软件
- 🎮 游戏
- 📦 其他

## 许可证

MIT
