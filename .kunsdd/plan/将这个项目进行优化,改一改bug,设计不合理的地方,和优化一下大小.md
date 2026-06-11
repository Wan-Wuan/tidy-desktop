好的，让我详细列出 **选项A（全面实施）** 下每一处具体修改：

---

## 📁 最终项目结构变化

### 1️⃣ 新增文件（约 20 个）

```
src/
├── shared/
│   └── electron.d.ts                 # [新] 共享 electronAPI 类型声明
│
├── main/
│   ├── config.ts                     # [新] 配置读写 + 默认配置
│   ├── utils.ts                      # [新] 通用工具函数
│   └── handlers/
│       ├── appHandlers.ts            # [新] 打开应用/文件夹/URL/Steam
│       ├── iconHandlers.ts           # [新] 图标提取 (EXE/Steam)
│       ├── fileHandlers.ts           # [新] JSON 文件读写
│       └── systemHandlers.ts         # [新] 自启动/对话框/窗口控制
│
├── renderer/src/
│   ├── components/
│   │   ├── SearchBar.tsx             # [新] 搜索栏组件
│   │   ├── AppGrid.tsx               # [新] 应用网格
│   │   ├── AppCard.tsx               # [新] 单个应用卡片
│   │   ├── CategoryBar.tsx           # [新] 分类栏 + 子分类栏
│   │   ├── DropZone.tsx              # [新] 拖拽放置区
│   │   ├── SettingsModal.tsx         # [新] 设置弹窗
│   │   ├── AddAppModal.tsx           # [新] 添加应用弹窗
│   │   ├── EditAppModal.tsx          # [新] 编辑应用弹窗
│   │   ├── CategoryManagerModal.tsx  # [新] 分类管理弹窗
│   │   └── SubcategoryManager.tsx    # [新] 子分类管理弹窗
│   ├── hooks/
│   │   ├── useApps.ts                # [新] 应用列表逻辑
│   │   ├── useCategories.ts          # [新] 分类/子分类逻辑
│   │   ├── useConfig.ts              # [新] 配置管理
│   │   ├── useDragDrop.ts            # [新] 拖拽逻辑
│   │   └── useSearch.ts              # [新] 搜索/搜索引擎
│   └── utils/
│       ├── pinyin.ts                 # [新] 拼音工具
│       ├── fileUtils.ts              # [新] 文件/路径处理
│       ├── steamUtils.ts             # [新] Steam URL 解析（合并两处重复）
│       └── iconUtils.ts              # [新] 图标处理
```

### 2️⃣ 修改文件（4 个）

| 文件 | 当前 | 修改后 | 变化说明 |
|------|------|--------|---------|
| `src/renderer/src/App.tsx` | 2271 行 | ≈300 行 | 删除 inline modals，改为 import 子组件，保留主布局和状态协调 |
| `src/renderer/src/SearchApp.tsx` | 348 行 | ≈200 行 | 删除重复的 `declare global`，改用 `electron.d.ts`，增加键盘导航 |
| `src/main/index.ts` | 616 行 | ≈150 行 | 删除所有 handler 逻辑，只保留窗口创建、生命周期、IPC 路由到 handler 文件 |
| `src/renderer/src/index.css` | 35 行 | ≈15 行 | 删除重复的 scrollbar 样式，提取到 shared.css |

### 3️⃣ 删除/清理文件（10 个）

| 文件 | 原因 |
|------|------|
| `src/shared/types.js` | tsc 残留产物，源码目录不应有 .js |
| `src/shared/types.js.map` | 同上的 sourcemap |
| `node_modules/uuid` | 改用 `crypto.randomUUID()`，移除依赖 |
| `node_modules/@types/uuid` | uuid 的配套类型定义 |
| `build/icon-512.png` | 1.6MB，与 icon-256.png 完全一样的内容 |
| `build/tray-icon-512.png` | 259KB，托盘图标不需要这么大 |
| `build/tray-icon-b64.txt` | 项目中未引用 |
| `public/tray-icon.png` | 与 `build/tray-icon.png` 重复 |
| `src/renderer/src/search.css` | 合并到 shared.css |
| `search.html` 中 `<style>` 块 | 内联样式移到 CSS 文件 |

---

## 🐛 修复的 Bug 明细

### Bug 1：图标缓存误删
```typescript
// 改前（main/index.ts）
if (stat.size < 1024) fs.unlinkSync(filePath)  // 误删有效图标

// 改后
if (stat.size === 0) fs.unlinkSync(filePath)    // 只删空文件
```

### Bug 2：每次启动重新提取全部图标
```typescript
// 改前（App.tsx loadData）
const needsIconUpdate = loadedApps.filter(a => !a.icon || !a.icon.startsWith('data:') || a.icon.length < 1000)

// 改后
// 只处理 !a.icon（完全没有图标的），且添加时间戳缓存
// 已存在 data:image 图标的跳过
const needsIcon = loadedApps.filter(a => !a.icon)
```

### Bug 3：`exec` 未使用导入
```typescript
// 改前
import { exec } from 'child_process'  // exec 从未使用

// 改后
import { execSync } from 'child_process' // 只导入实际使用的
```

### Bug 4：Steam URL 解析重复
```typescript
// 改前：两个文件中同样的正则匹配逻辑
// App.tsx: parseSteamUrlFromText()
// EditAppModal: parseSteamUrl()

// 改后：统一在 steamUtils.ts 中
export function parseSteamUrl(text: string): SteamParseResult | null
```

### Bug 5：文件路径类型不安全
```typescript
// 改前
const filePath = (file as any).path

// 改后
interface FileWithPath extends File { path: string }
const filePath = (file as FileWithPath).path
```

---

## 📦 体积优化效果

| 项目 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 构建图标 (`build/icon-*.png`) | 3.2 MB | ~180 KB | **~3 MB** |
| `uuid` + `@types/uuid` 依赖 | ~30 KB | 0 | **~30 KB** |
| 冗余图标/文本文件 | ~270 KB | 0 | **~270 KB** |
| 残留 .js/.js.map | ~140 B | 0 | **~140 B** |
| CSS 重复样式 | ~2 KB | ~1 KB | **~1 KB** |
| **总计** | **~3.5 MB** | **~180 KB** | **~3.3 MB (约 94%)** |

> 注：这只是构建资源体积，node_modules 移除 uuid 也能减少安装体积。

---

## 🧪 测试验证清单

每次改动后需要验证：
1. `npm run typecheck` — 类型无错误
2. `npm run build` — Vite 构建通过
3. `npm run build:main` — 主进程编译通过
4. 手动测试：创建分类、添加应用、拖拽、搜索、快捷键、图标显示、搜索引擎

---

## ⚠️ 主要风险

1. **App.tsx 重构风险最大**（2271 行 → 拆分 15+ 文件）
   - 所有 modal 的状态管理（`showSettings`, `showAddApp` 等）分布在多个组件
   - 拖拽逻辑依赖多个 `useRef`（`dragCounterRef`, `appsRef` 等），需要正确传递
   - 搜索引擎状态（`activeEngine`）跨 SearchBar 和主 App 交互

2. **主进程拆分风险中等**
   - IPC channel 名称必须完全一致（`extract-icon`, `get-config` 等）
   - 窗口引用（`mainWindow`, `searchWindow`）需要在模块间传递

3. **uuid 替换风险低**
   - `crypto.randomUUID()` 在 Electron 28 中支持，无需额外 polyfill

---

想让我开始执行 **选项A** 吗？或者你更倾向于先做某个子集？