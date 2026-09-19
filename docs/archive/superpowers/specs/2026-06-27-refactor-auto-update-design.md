# Auto-Update 全流程重构设计

**日期：** 2026-06-27
**目标：** 重构应用检测更新、下载更新、安装更新的全过程，提升代码可维护性、安装可靠性和用户体验。

## 当前问题

1. `updateHandlers.ts` 单文件承担所有职责（网络、文件 I/O、IPC、脚本生成）
2. 安装依赖 batch 脚本 + `tasklist` 轮询，有竞态条件（已修 10+ 次）
3. 5 个独立 `useState` 管理更新状态，容易出现不一致
4. 下载不支持断点续传，网络中断需从头下载
5. 下载完成后自动安装，无用户确认环节

## 设计方案

### 1. 模块结构

```
src/main/update/
├── types.ts          # 类型定义
├── network.ts        # fetchJson(), downloadFile() — 断点续传 + 重试
├── installer.ts      # PowerShell 脚本生成与执行
└── index.ts          # registerUpdateHandlers() — IPC 入口 + 状态机

src/renderer/src/
├── hooks/
│   └── useUpdate.ts          # 前端状态管理 hook
└── components/
    └── UpdateButton.tsx       # 更新按钮 + 安装确认弹窗
```

**职责：**

- `types.ts` — `UpdateState`, `UpdateInfo`, `DownloadProgress` 等共享类型
- `network.ts` — 纯网络操作，不关心 IPC 或 UI。提供 `fetchJson(url)` 和 `downloadFile(url, dest, onProgress, options)` 两个函数
- `installer.ts` — 生成 PowerShell 脚本并执行，返回 Promise。脚本内部用 `Wait-Process` 等待 app 退出，用 `Start-Process -Wait` 运行安装器
- `index.ts` — 注册 IPC handler，管理更新状态机，协调 network ↔ installer ↔ renderer 的数据流

### 2. 更新状态机

```
idle → checking → available → downloading → downloaded → installing → app.quit()
         ↓                            ↑
    (无更新/出错)                  (失败重试)
         ↓                            │
        idle ←───────────────────────┘
```

| 状态 | 含义 | UI 表现 |
|------|------|---------|
| `idle` | 未检查或无更新 | 无按钮 |
| `checking` | 正在检查更新 | 设置页显示 spinner |
| `available` | 有新版本，准备自动下载 | 短暂提示后自动进入 downloading |
| `downloading` | 正在下载 | header 显示旋转动画 + 百分比 |
| `downloaded` | 下载完成 | 弹窗："新版本已准备就绪，是否安装？" |
| `installing` | 正在安装 | 弹窗关闭，app 准备退出 |

**关键变化：** 启动时自动检查 → 自动下载 → 弹窗确认安装（不再自动安装）。

### 3. 网络层（断点续传 + 重试）

#### 断点续传

```
1. HEAD 请求获取 Content-Length
2. 检查本地临时文件是否存在 + 已下载大小
3. 如有已下载部分：
   - 发送 Range: bytes=<offset>- 请求
   - 206 Partial Content → 追加写入
   - 200 OK → 不支持续传，从头下载
4. 无已下载部分 → 普通下载
```

使用 `fs.appendFile` 追加模式。进度基于总文件大小计算。完成后校验文件大小一致。

#### 重试机制

- 最大重试次数：3 次
- 退避间隔：1s → 2s → 4s（指数退避）
- 重试条件：网络错误、超时、连接重置
- 不重试条件：404、文件校验失败
- 断点续传：重试时从已下载位置继续

#### GitHub API 速率限制

- 检测 403 响应的 `X-RateLimit-Remaining: 0`
- 解析 `X-RateLimit-Reset` 时间戳
- 向 renderer 报告 "请求过于频繁，请稍后再试"

### 4. 安装方案（PowerShell 脚本）

替换当前的 batch 脚本。脚本内容对用户不可见。

#### 流程

1. 主进程写入 PowerShell 脚本到 `%TEMP%/tidy-desktop-update.ps1`
2. 通过 `Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File <script>"` 启动
3. 脚本内部：
   - `Wait-Process -Id <pid> -Timeout 30` — 等待 app 退出（不轮询）
   - `Start-Process "<installer>" -ArgumentList "/S" -Wait` — 运行安装器
   - 写入安装日志到 `%TEMP%/tidy-desktop-install.log`
   - `finally { Remove-Item "<script>" -Force }` — 自清理
4. 主进程调用 `app.quit()`

#### 对比 batch 方案的改进

| 维度 | Batch 脚本 | PowerShell 脚本 |
|------|-----------|----------------|
| 等待进程退出 | `tasklist` + `findstr` 轮询 | `Wait-Process` 原生等待 |
| 超时处理 | 循环 30 次 | `-Timeout 30` 参数 |
| 错误处理 | 无 | `try/catch/finally` |
| 安装日志 | 无 | 写入文件 |
| 自清理 | `timeout /t 2 && del` | `finally` 块 |

#### 安全考虑

- 脚本路径硬编码在 `%TEMP%`，不接受外部输入
- 安装器路径来自下载步骤的常量 `UPDATE_FILE`
- `ExecutionPolicy Bypass` 仅针对当前脚本

### 5. 前端 Hook 与组件

#### `useUpdate` Hook

```typescript
interface UseUpdateReturn {
  state: UpdateState
  version?: string
  progress?: DownloadProgress
  error?: string
  releaseNotes?: string
  currentVersion: string

  checkForUpdate: () => void   // 手动检查更新（设置页）
  retryDownload: () => void    // 下载失败后手动重试
  confirmInstall: () => void   // 用户确认安装
  dismissUpdate: () => void    // 关闭弹窗，本次不再提示
}
```

- 启动时自动调用 `checkForUpdate()`，检测到新版本后自动进入 `downloading`，无需用户干预
- `retryDownload` 仅在自动下载失败时可用，用于用户手动触发重试
- `dismissUpdate` 关闭弹窗但保留已下载文件。下次启动时，如果文件存在且大小匹配，跳过下载直接进入 `downloaded` 状态
- 所有状态转换逻辑封装在 hook 内部
- App.tsx 只需调用 `useUpdate()` 并渲染 `UpdateButton`

#### `UpdateButton` 组件

Header 中的更新指示器：
- `idle` / `checking` → 不渲染
- `available` → 不渲染（即将自动下载）
- `downloading` → 渲染进度指示器（旋转动画 + 百分比），沿用当前样式
- `downloaded` → 不渲染（弹窗组件接管）
- `installing` → 不渲染

#### 安装确认弹窗

```
┌─────────────────────────────────────┐
│  🎉 新版本 vX.X.X 已准备就绪       │
│                                     │
│  更新内容：                         │
│  • release notes 内容               │
│                                     │
│        [ 稍后再说 ]  [ 立即安装 ]   │
└─────────────────────────────────────┘
```

- "立即安装" → `confirmInstall()` → `installing` → app.quit()
- "稍后再说" → `dismissUpdate()` → 弹窗关闭，文件保留

### 6. 错误处理

#### 网络错误分级

| 错误类型 | 处理方式 | 用户提示 |
|---------|---------|---------|
| 无网络 | 重试 3 次后静默失败 | 无（后台检查） |
| GitHub API 403 速率限制 | 停止重试 | "检查更新失败：请求过于频繁" |
| GitHub API 404 | 停止重试 | 静默 |
| 下载中断 | 断点续传 + 重试 | 进度回退后继续 |
| 下载校验失败 | 删除文件，重试 1 次 | "下载文件损坏，正在重新下载" |
| 安装器被拦截 | 捕获错误 | "安装失败，请检查杀毒软件设置" |

#### 边界情况

- **磁盘空间不足：** 下载前粗略检查可用空间
- **重复下载：** 已下载文件校验大小一致则跳过
- **休眠恢复：** 下载超时后自动重试
- **设置页手动检查：** 保持现有功能，手动检查可触发完整流程

## 文件变更清单

| 操作 | 文件 |
|------|------|
| 新建 | `src/main/update/types.ts` |
| 新建 | `src/main/update/network.ts` |
| 新建 | `src/main/update/installer.ts` |
| 新建 | `src/main/update/index.ts` |
| 新建 | `src/renderer/src/hooks/useUpdate.ts` |
| 新建 | `src/renderer/src/components/UpdateButton.tsx` |
| 修改 | `src/main/preload.ts` — 更新 IPC 暴露的方法 |
| 修改 | `src/shared/electron.d.ts` — 更新类型定义 |
| 修改 | `src/main/index.ts` — 更新注册入口 |
| 修改 | `src/renderer/src/App.tsx` — 移除内联更新逻辑，使用 hook + 组件 |
| 删除 | `src/main/handlers/updateHandlers.ts` |

## 不在范围内

- 不引入 `electron-updater`，继续使用 GitHub Releases API
- 不添加签名验证（当前 NSIS 安装器未签名）
- 不支持 macOS/Linux 更新（当前仅 Windows）
