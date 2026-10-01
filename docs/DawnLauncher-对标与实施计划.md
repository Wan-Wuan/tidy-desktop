# tidy-desktop × Dawn Launcher 功能对标与实施计划

> 文档性质：**需求分析与实施规划 + P0 实施记录**（P0 的代码已落地，见「实施进度」一节）。
> 对标对象：Dawn Launcher 3 免费版 v3.0.9 / Dawn 3 Pro v3.0.6（2026-09-28 更新）
> 当前基线：tidy-desktop v2.9.2（Electron 43 + React 18 + TS + Vite 8 + Tailwind 3）
> 撰写日期：2026-09-29 · **第二轮修订：2026-09-29 · P0 实施完成：2026-09-29**

---

## 修订记录（第三轮 · P0 实施）

P0 / v2.9.3 的 16 个步骤已全部落地。**进度表（下一节）是唯一权威的状态来源**，
本节只记与计划的偏离和踩到的坑，细节见各步骤的「实现说明 / 实机验证记录」。

| # | 与计划的偏离 | 理由 |
|---|---|---|
| 1 | 收纳格存**独立的 `collections.json`**，而非扩展 `categories.json` | §4.1 已明确收纳格与分类是并列层级；独立文件后不与拖拽最敏感的 `groupedApps` 抢同一个文件 |
| 2 | `NoteViewerModal` **从 P3 前移到 P0** | P0 表单已暴露「文本」类型，不给「打开」动作会产生一批点不开的卡片 |
| 3 | 补完 **`browserId`**（表单「打开方式」+ `resolveUrlBrowser`） | 字段、清洗、持久化、右键菜单都在，唯独没有输入口——不补就是一个永远为 `null` 的死字段 |

实施中发现并修掉的计划外问题：`.app-shell` 网格定位缺失导致横幅挤进左侧栏；
深色主题 `bg-amber-50` 未覆盖导致琥珀胶囊对比度 1.39:1（既有缺陷）。
两处都写进了步骤 14/15 的记录。

> ⚠️ **发版口径已变更（2026-10-01）**：本文档里 `v2.9.3 / v2.9.4 / v2.9.5 / v2.9.10`
> 只是**阶段代号**，四个阶段从未单独发布。实际发版是一次性大版本
> **v3.0.0**（`package.json` 从 `2.9.2` 走 `npm run release -- major`）。
> 下面各修订记录里的 "patch 发版" 说法是当时的决策，已作废——以 §7 决策点 #4 为准。

---

## 修订记录（第二轮）

本次修订按你的指示做了 3 处调整，下表列出**改动内容、落点、结果**：

| # | 改动 | 文档中的落点 | 结果 |
|---|---|---|---|
| 1 | **版本号改为 patch 序列** | §0 第 3 点、§3 各阶段标题、§6 各阶段标题、§7 决策点 | P0 = **v2.9.3**、P1 = **v2.9.4**、P2 = **v2.9.5**、P3 = **v2.9.10**（2.9.6–2.9.9 预留）。原「3.0.0 起」的 minor 口径已全部撤掉，每阶段 = 一次 patch 发版，因此「3.0.0 是否拆两次」这个决策点一并删除 |
| 2 | **鼠标手势唤出暂不实现** | §2.2 第 14/15/16 行、§3 的 P1 功能表、§4.2 设置页设计、§5.1 主进程能力表、§6 阶段 P1 步骤、§7 R1 与决策点 | P1 从 5 项减为 **4 项**（删除原 P1-5），§2.2 三行改判 ⛔、§7 R1 由「高风险待验证」改为「已决策暂缓」，决策点 #2 删除。**不引入任何原生模块**，打包链路维持现状 |
| 3 | **更换默认主热键** | §0 第 5 点、§3 新增 **P0-7**、**§5.6 全新章节**、§6 P0 步骤表第 1 行、§7 R12 与新增 R13、§8 检查表 | 默认主窗口热键 `Alt+Space` → **`Ctrl+Alt+Space`**，附三级降级链与老用户一次性迁移方案，详见 §5.6 |

> 修订未触碰的部分：产品定位分析（§1）、覆盖度矩阵（§2）、优先级划分思路、界面设计（§4）、除热键外的技术方案（§5）、风险 R2–R11、检查表主体。

---

## 实施进度（P0 · v2.9.3）

> 本表随实施推进更新。步骤编号对应 §6 的 P0 步骤表。

| 步骤 | 内容 | 状态 | 落点与验证 |
|---|---|---|---|
| 1 | 默认热键更换 + 降级链 + 老用户迁移 + 默认值收敛 | ✅ 完成 | `shared/defaults.ts`（新）、`shared/defaults.test.ts`（新，17 项）、`main/config.ts`、`main/index.ts`、`modals/SettingsModal.tsx`、`App.tsx`、`utils/keyboard.ts`、`shared/electron.d.ts`、`__audit__/fixtures.ts`。typecheck 三套 + 测试全绿 |
| 2 | 扩展类型（`AppItemType` / 新字段 / `Config` 新键） | ✅ 完成 | `shared/types.ts`、`main/validation.ts`（`APP_ITEM_TYPES` 白名单）、`handlers/fileHandlers.ts`、`modals/EditAppModal.tsx`、`hooks/useAppCrud.ts`、`utils/appTypes.ts`（新） |
| 3 | 路径解析纯函数 + 测试 | ✅ 完成 | `shared/pathResolve.ts`（新）、`shared/pathResolve.test.ts`（新，32 项）。**不依赖 `node:path`**，渲染层可直接用 |
| 4 | `Get-StartApps` Appx 扫描（异步 + 缓存 + 降级） | ✅ 完成 | `shared/appTargets.ts`（新）、`shared/appTargets.test.ts`（新，12 项）、`main/shortcutFilter.ts`（`mergeAppxResults` / `normalizeDisplayName`）、`main/handlers/systemHandlers.ts`、`main/handlers/appHandlers.ts`（AppsFolder 启动分支）、`hooks/useMaintenance.ts`。**实机验证见下** |
| 5 | URL 元信息抓取 | ✅ 完成 | `shared/urls.ts`（新）、`shared/urls.test.ts`（新，13 项）、`main/urlMeta.ts`（新）、`main/urlMeta.test.ts`（新，29 项）、`main/urlMeta.fetch.test.ts`（新，14 项，本地 HTTP 靶子）、`handlers/urlMetaHandlers.ts`（新）、`main/index.ts`、`main/config.ts`、`main/validation.ts`、`shared/types.ts`、`main/preload.ts`、`shared/electron.d.ts`、`__audit__/mockApi.ts`。**实机验证见下** |
| 6 | 组合启动 | ✅ 完成 | `main/groupLaunch.ts`（新，纯逻辑）、`main/groupLaunch.test.ts`（新，12 项）、`main/handlers/appHandlers.ts`（`openAppTarget` 抽取 + `launch-group` 通道）、`shared/types.ts`、`main/preload.ts`、`shared/electron.d.ts`、`__audit__/mockApi.ts`。**说明见下** |
| 7 | `folderSync.ts` | ✅ 完成 | `main/folderSync.ts`（新，纯逻辑 + 扫描 + 缓存）、`main/folderSync.test.ts`（新，36 项）、`main/handlers/folderSyncHandlers.ts`（新，IPC + 三段式触发）、`main/index.ts`（注册 + 定时器 + 窗口 focus 钩子）、`main/validation.ts`（`hiddenPaths` / `order` 清洗）、`shared/types.ts`。**说明见下** |
| 8 | IPC 登记（invoke + 事件） | ✅ 完成 | 随各步骤落地：`fetch-url-meta` / `launch-group` / `sync-link-folder` / `get-folder-sync-cache` 四个 invoke + `folder-sync-updated` 事件，均已在 `main/preload.ts` 与 `shared/electron.d.ts` 双处登记，并补进 `__audit__/mockApi.ts`。**每个新 handler 首行都是 `assertSender(event)`**（已 grep 核查），事件发送带 `did-finish-load` 兜底 |
| 9–13 | 渲染层界面（6 类型表单 / 网址卡片 / 组合卡片 / 收纳格 / 关联文件夹状态） | ✅ 完成 | 表单：`modals/AppDraftForm.tsx`（新，Add/Edit 共用）、`modals/AppTypeSegmented.tsx`（新）、`components/AppTypeIcon.tsx`（新）；网址：`utils/domainAvatar.ts`（新）、`utils/urlMetaError.ts`（新）、`hooks/useUrlMeta.ts`（新）、`utils/urlBrowser.ts`（新）；组合：`components/LaunchGroupPanel.tsx`（新）、`hooks/useLaunchGroups.ts`（新）、`utils/launchError.ts`（新）；文本：`modals/NoteViewerModal.tsx`（新，**从 P3 前移**，理由见下）；收纳格：`components/CollectionBox.tsx`（新）、`hooks/useCollections.ts`（新）、`utils/persist.ts`、`AppGrid.tsx`、`CategoryNav.tsx`、`App.tsx`；关联文件夹：`components/FolderSyncBanner.tsx`（新）、`hooks/useFolderSync.ts`（新）、`utils/syncedId.ts`（新）、`CategoryOverlays.tsx`、`AppContextMenuOverlay.tsx`、`utils/dropTarget.ts`、`hooks/useDragAndDrop.ts`。另新增 `collections.json` 持久化链（`main/config.ts` / `validation.ts` / `handlers/fileHandlers.ts` / `handlers/systemHandlers.ts` / `main/index.ts` 启动备份）与 `open-url-with-browser` 通道（`handlers/appHandlers.ts`） |
| 14 | 样式（收纳格、角标、横幅、徽章） | ✅ 完成 | `index.css` 末尾「P0 / v2.9.3 新增界面元素」段：`.app-type-segmented` / `.url-fetch-button` / `.url-avatar-letter` / `.app-tile-badge` / `.app-tile-synced` / `.group-member-*` / `.launch-group-*` / `.note-viewer-body` / `.collection-box*` / `.link-folder-badge*` / `.folder-sync-banner*` + `.theme-glass` 提亮覆盖；`.icon-bg-url/-note/-group` 补进浅色 / `.theme-dark` / `.theme-glass` 三处。**另修**：`.app-shell` 网格四处布局补 `folder-sync-banner` 定位；深色主题补 `bg-amber-50` / `border-amber-200` 深底覆盖 |
| 15 | 测试 + 视觉审计 | ✅ 完成 | 新增测试：`domainAvatar.test.ts`（15 项）、`syncedId.test.ts`（6 项）、`launchError.test.ts`、`urlBrowser.test.ts`（4 项）、`dropTarget.test.ts` 扩到收纳格落点。**全量 35 文件 / 368 项通过**。视觉审计：`.audit/spec-p0.json`（新，42 场景）+ `.audit/contrast.mjs`（新，对比度探针），0 控制台错误、≥1024 无硬裁、对比度全部 ≥ 4.5:1。**结果见下** |
| 16 | 文档：README / CHANGELOG | ✅ 完成 | `README.md`（六种类型 / 收纳格 / 关联文件夹 / 数据文件 / 设置项 / 快捷键表）、`CHANGELOG.md`（v2.9.3 条目） |
| 17 | **路径解析接线（补步骤 3 的缺口）** | ✅ 完成 | 见下「P0-4 接线补记」 |

### P0-4 接线补记（2026-09-29）

⚠️ **步骤 3 当时只落了纯函数与测试，没有任何调用点。** `envVars` / `portableRoot` / `preferRelativePath` 三个配置项在 `src/` 里除了 `types.ts` 与 `validation.ts` 之外**零引用**——设置页没有入口，存取路径处也没人调 `resolveProjectPath`。即 P0-4 的「相对路径 + 环境变量」**功能实际不可用**，只是"数据模型与清洗就绪"。本轮补齐：

- `main/pathResolver.ts`（新）：缓存 `Config.envVars` / `Config.portableRoot` 作为解析上下文，导出 `resolveIncomingPath()`；`save-config` 成功后失效缓存。测试 `pathResolver.test.ts`（8 项，mock 掉 electron 走纯 Node）。
- **收口在主进程**：`appHandlers` 的 `open-app` / `open-folder` / `open-containing-folder` / `show-item-in-folder` / `open-app-as-admin` / `copy-file|image-to-clipboard` / 组合启动成员，以及 `iconHandlers` 的 `extract-icon`，全部改成 **`resolveAndAssert()`：先解析、再 `assertPath`**。顺序不能反——相对路径过不了「必须绝对路径」那道关，先校验等于把便携路径直接拒掉。
  - ⚠️ `isAppsFolderTarget` 必须在解析**之前**判断：`shell:AppsFolder\xxx` 不是文件系统路径，一旦被当成相对路径拼到 `portableRoot` 下就彻底跑飞。
  - `open-path`（本机文件搜索结果）**不解析**：那些是 Everything 给出的真实绝对路径，且文件名里可能出现 `%`。
- **渲染层管"存"与"比"**：`useAppCrud` 新增 `toStoredPath()`（`preferRelativePath` 且落在 `portableRoot` 下才存相对路径，只作用于**新增/修改**，不批量改写老数据）与 `pathKeyOf()`（去重比较一律先还原成绝对路径，否则同一条目以 `D:\Portable\a.exe` 和 `a.exe` 两种写法会各加一次）；`parsePathsToApps` 里给主进程的 `.lnk` 路径也先还原，否则相对路径的快捷方式读不到。
- **设置页入口**：「项目」分区新增**环境变量表**（增删改 + 键名/重名校验）、**便携根目录**（选择 / 清除）、**优先保存相对路径**开关。

> R7（是否新增便携版打包目标）仍是待决策项——不做 portable target 时，相对路径只对"用户自己指定根目录"有意义。

> 验证：`npm run typecheck` 三套全绿；`npm test` **41 文件 / 440 项通过**（本轮新增 21 项：
> `pathResolver.test.ts` ×8、`preset.test.ts` ×8、`SettingsModal.test.tsx`「项目」分区 ×5）；
> `npm run lint` 0 error；`npm run build` 通过。


### 步骤 4 实机验证记录（2026-09-29）

- `Get-StartApps` 在本机返回 **256** 条，其中 **48 条**是 AUMID 形态（`<包族名>_<13 位哈希>!<应用 ID>`，如 `Claude_pzs8sxrjxfjjc!Claude`），**208 条**是路径型（`D:\Program Files\010 Editor\010Editor.exe`）。→ 只收 AUMID 形态的过滤规则成立，路径型已被 .lnk 扫描覆盖，收进来只会制造重复项。
- `ConvertTo-Json` 在只有 1 条结果时输出**对象而非数组**，代码已统一成数组处理。
- ⚠️ **Appx 项目拿不到真实图标**：实测 `app.getFileIcon('shell:AppsFolder\\<AUMID>')` 返回的是 318/968 字节的**通用占位图标**（对不存在的 AUMID 返回同样字节数），而真实 .exe 是 4118 字节。因此这类项目的图标降级为字母头像（与"提取失败"走同一条既有降级路径），不做投机实现。若将来要补，方向是解析 `AppxManifest.xml` 的 `Square44x44Logo`，但安装目录 `C:\Program Files\WindowsApps` 需提权读取，成本较高。

### 步骤 5 实机验证记录（2026-09-29）

对真实站点跑通了标题与 favicon 抓取（`example.com` / `www.baidu.com` / `github.com` / http→https 重定向），并针对本地 HTTP 靶子写了 14 项回归测试。过程中发现并修正了计划里的一个**参数错误**：

- ❌ **原计划「响应体上限 512KB」定得太紧**。实测 `github.com` 首页光 `<head>` 就超过 512KB，按字节截断会直接判成 `too-large`，标题一个都拿不到。
- ✅ **改为按结构控制**：`<title>` 与图标声明一定在 `<head>` 里，所以**读到 `</head>` 立刻断开连接**；1MB 只作为「页面畸形、始终没有 `</head>`」的兜底。修复后 github 正常返回标题与 CDN 上的 favicon。
- 重定向跟随改为一整条链路共用 5s 预算（原来按"每跳 5s"会叠出 30s）；重定向目标同样要过 http/https 白名单，`file:` 之类一律拒绝。
- 顺带把 `isSafeExternalUrl` 的判断逻辑从 `main/urlPolicy.ts`（顶层读 `app.isPackaged`，无法在测试里 import）收敛到 `shared/urls.ts`，现在 URL 判定只有一处定义。

### 步骤 6 实现说明（2026-09-29）

- **按类型分派**，而不是所有成员都走 `open-app`：渲染层的启动逻辑本来就是分派的（`folder → openFolder`、`steam → openSteam`、其余 `openApp`），组合启动必须保持一致，否则「单独点能开、放进组合就打不开」。因此主进程的 `launchGroupMember` 按 `type` 走四条路径：`folder` 直接 `openPath`、`steam` 走协议白名单、`url` 走 `normalizeHttpUrl`、其余走 `openAppTarget`。
- **`note` 与 `group` 明确报 `unsupported-type`**：笔记还没有"打开"这个动作（P3-1 才做），组合套组合会无限展开。两者都报错而不是静默跳过，用户才能在结果面板里看到"少开了一个"。
- **并发 vs 串行做成参数**（`serial`），默认并发；串行模式每个成员间隔 250ms，避免一批程序同时抢磁盘。
- **单个成员失败不中断整批**：`Promise.all` 下每个成员各自 catch 成 `{ ok:false, error }`，最后由 `summarizeGroupLaunch` 汇总。`ok` 只在**全员成功**时为 true——只要有失败，界面就该把明细摊开。
- ⚠️ **尚未做真机启动验证**：单元测试覆盖了入参清洗（超长截断、数量上限、非法 type 降级）与结果汇总，但"真的把程序拉起来"这一步需要在实际使用中确认（不想在开发机上凭空弹出十几个程序）。`shell:AppsFolder\<AUMID>` 走 `explorer.exe` 的路径同理，属 Windows 官方启动方式，未经本机实测。

### 步骤 7 实机验证记录（2026-09-29）

拿三个真实目录跑了扫描（临时探针，跑完即删）：

| 目录 | 条目 | 截断 | 观察 |
|---|---|---|---|
| `%APPDATA%\…\Start Menu\Programs` | 59（19 目录 / 40 应用） | 否 | 中文名目录（百度网盘、波点音乐、剪映专业版…）层级与排序正常 |
| `%PROGRAMDATA%\…\Start Menu\Programs` | 234（71 目录 / 163 应用） | **是** | 有深度 3 的子目录，触到 `maxDepth` 上限 |
| 本仓库 `scripts/` | 22（1 目录 / 21 应用） | 否 | `.mjs` / `.py` / `.ps1` 按 `ALL_FILE_EXTS` 白名单正常收录 |

由此确认两点：

1. **`truncated` 的语义要按"仅显示前 3 层"来写文案**，不能写成"内容不完整"——触到深度上限时我们并没有看到更深层到底有没有东西，只是保守地标记出来。234 条那个目录就是这种情况（条目数远没到 500 的上限）。
2. **关联文件夹同步刻意不做卸载器过滤**（结果里能看到 `卸载百度网盘.lnk`、`uninst.lnk`、`Uninstall 010 Editor.lnk`）。这与「快捷方式导入」不同是有意的：
   - 导入是**一次性**动作，过滤噪音能少一堆手动删除；
   - 同步是**持续镜像**，"我文件夹里明明有这个文件，为什么不显示"是更糟的体验；用户可以用 P0-5 自带的**隐藏单项**功能处理噪音。
   这条差异需要写进 README，否则会被当成 bug。

其他实现要点：
- **三段式触发**：定时轮询 5 分钟 + 主窗口 `focus` + 手动刷新；`focus` 那条带 **30s 最小间隔**防抖（alt-tab 很频繁，不能每次聚焦都扫盘）。
- **目录丢失不清空上次结果，也不推进 `lastSyncAt`**（`applyFolderSync` 的关键不变量，有专门用例盯住）——否则 U 盘/网络盘掉线会让用户看到一片空白，以为条目被删了；不推进时间则是为了不把 30s 防抖变成"重试也被挡住"。
- **用户意图与扫描结果分开存**：`hiddenPaths` / `order` 跟分类走（`categories.json`，不可再生），扫描结果只进 `folderCache.json`（随时可丢）。
- ⚠️ **测试文件刻意不做临时目录清理**：本环境的 safe-delete 拦截会让 `fs.rmSync(recursive)` 与逐项 `unlinkSync`/`rmdirSync` 全部挂住（afterAll 10s 超时），清理改为不做后该文件从 18s 降到 0.2s。文件里有醒目注释，别把清理加回来。

### 步骤 9–14 实现说明（2026-09-29）

**与计划不一致的两处（均为有理由的偏离）**

1. **`collections.json` 独立成文件**，而不是按计划字面「扩展 `categories.json`」。§4.1 本来就写明收纳格与分类是并列的层级概念，且收纳格会频繁改成员列表——塞进 `categories.json` 会让 `groupedApps` 那段（拖拽最敏感的地方）多出一层判断。独立文件后，收纳格的读写与分类完全解耦，导入/导出/备份/诊断各自登记一次即可。
2. **`NoteViewerModal` 从 P3 前移到 P0**。P0 的添加表单已经暴露了「文本」类型，若不给出「打开」动作，用户会得到一批点不开的卡片——那是比"少一个功能"更糟的体验。因此把阅读/复制/编辑面板一起做了。

**渲染层的关键决策**

- **表单收敛成一份**（`AppDraftForm`）：添加与编辑共用，`useAppCrud` 的 `handleAddApp` / `handleUpdateApp` 也只收一个 `AppItemDraft` 对象。原先两个弹窗各摊开 5~6 个位置参数，加一个类型要改三处签名，漏一处就是「弹窗里填了、存下去丢了」。
- **换类型要清残留字段**：`buildTypeFields()` 只写当前类型的键，`buildUpdatedApp()` 在应用新字段前先 `delete` 掉全部类型专属键。否则「文本 → 应用」会留下孤儿 `noteContent`，「组合 → 应用」会留下 `memberIds`。
- **路径去重按类型放行**：文本与组合的 `path` 一律存空串，无条件的路径重复检查会把第二个文本项判成重复项。
- **网址头像不用灰图标**：抓不到 favicon 时用 `getAvatarBackground/getAvatarLetter` 从域名推一个固定色相，同一站点永远同一颜色。抓取失败的网址如果全是同一个灰图标，用户根本分不清谁是谁。
- **`browserId` 这条链路本次才补完**：字段、清洗、持久化、右键「用其它浏览器打开」都在，但表单里原本没有输入口——也就是说它只能永远是 `null`。现在网址表单多一个「打开方式」选择器（仅在配置里登记了浏览器时出现），并抽出纯函数 `resolveUrlBrowser()`：解析不到就**静默回落**到系统默认浏览器，不报错。
- **同步条目不进 `apps.json`**：每次渲染从 `folderCache.json` + `categories.linkFolder` 现算成 `AppItem` 形状，用 `synced:` 前缀的稳定 id（`syncedId.ts` 按**第一个**冒号切分，Windows 盘符的冒号能活下来）。它们被排除在「全选 / 编辑 / 删除」之外，右键只有「在文件夹中隐藏」。
- **收纳格成员不再在子分类分组里重复出现**：`groupedAppIds` 排除已收进收纳格的项目。⚠️ 注意这与「拖拽期间不能把源卡片移出 DOM」是两回事——后者是拖拽状态的硬约束，前者是静态归属，别混为一谈。
- **收纳格重命名走行内输入框**，不用原生 `prompt`：原生对话框是独立系统窗口会夺焦，开着「失焦自动隐藏」时会把主界面一起藏掉（v2.9.2 已经在 `alert` 上踩过一次）。
- **`.collection-box` 刻意不写 `:hover`**：它是拖拽放置目标，一旦有 `:hover` 底色，拖拽时鼠标必然悬停其上，0,2,0 的 `:hover` 会把 0,1,0 的 `[data-dragover]` 高亮整个压掉——这个坑项目里已在卡片、分类按钮、子分类按钮上各踩过一次。CSS 里写了原因，别加回来。

### 步骤 15 视觉审计记录（2026-09-29）

新建 `.audit/spec-p0.json`（42 场景：收纳格展开/折叠、同步正常/出错、网址与文本卡片、添加与编辑弹窗的网址/组合态、四种右键菜单、三种布局、600px 窄宽、1920 大屏）与 `.audit/contrast.mjs`（对比度探针，按祖先链合成半透明底色后算 WCAG 比值）。

**发现并修掉的两个真问题**

1. **关联文件夹横幅被网格挤进左侧栏**（宽度 190px、文字一字一行）。根因：`.app-shell` 是**显式定位**网格，每个子项都必须写死 `grid-column`/`grid-row`，新加的横幅漏写就被自动布局丢进了 row4/col1。已在 base / `command-rail` / `studio-split` / `≤820px` 四处补齐，并在 CSS 里写明这条约束。
2. **深色主题下「N 个图标待补全」胶囊对比度 1.39:1**（浅字压浅底，等于看不见）。这是**既有缺陷**，不是本次改动引入：`.theme-dark` 把 `text-amber-700` 提亮成 amber-300，但 `bg-amber-50` 是字面色值、不跟主题走。与 `bg-white/NN` 属同一类问题，已在 `.theme-dark` 与 `.theme-system`（媒体块内）两处补深底覆盖。

**审计结论**：42 场景 × 主题/布局组合，0 控制台错误、≥1024 宽度无硬裁、头部无越界；新界面元素在 5 种主题下的文字对比度**全部 ≥ 4.5:1**。600px 下仅有的 3 条「越界」落在分类条的横向滚动区（`scroll=833/568`，可滚动，非硬裁），属既有设计。

**探针本身踩的坑**（写在这里省得下次重踩）：最初的 `effectiveBg` 在祖先链上找不到不透明底色时**默认按白底**算，于是 `.theme-glass` 的渐变画布上所有浅色文字都被报成 1.1~1.3:1 的假阳性。修法是遇到 `background-image !== 'none'` 就**放弃判定**（返回 null 跳过该元素）——渐变底色取不到，硬算只会制造噪音。

### 步骤 16 文档说明（2026-09-29）

- `README.md`：核心功能补「六种项目类型 / 网址项目 / 组合启动 / 文本备忘 / 收纳格 / 关联文件夹」，分类管理下新增「收纳格」「关联文件夹」两节（含**同步不做卸载器过滤**这条差异的说明），设置项补「自动获取网址信息」「浏览器列表」，数据存储补 `collections.json` / `folderCache.json`。
- `CHANGELOG.md`：新增 v2.9.3 条目（新增 / 修复 / 优化 / 验证四段）。
- ⚠️ **发版用 `major`**（见 §7 决策点 #4）：`npm run release -- major` 把 `2.9.2` 推到 `3.0.0`。`release.mjs` 只校验 CHANGELOG 里出现过该版本号，不会替你发现口径问题。

---

## 实施进度（P1 · v2.9.4）

> 步骤编号对应 §6 的 P1 步骤表。原计划 P1 第 5 项「鼠标手势唤出」已在修订中删除（需原生模块），
> 故 P1 为 4 项功能 + 搜索窗分组标题。

| 步骤 | 内容 | 状态 | 落点与验证 |
|---|---|---|---|
| 1 | 暂停 / 恢复快捷键 | ✅ 完成 | `main/index.ts`（`toggleLaunchPaused` + 托盘暂停感知 + `launch-paused-changed` 事件）、`main/preload.ts`、`shared/electron.d.ts`、`shared/types.ts`（`Config.pauseHotkey` / `launchPaused`）、`shared/defaults.ts`（`DEFAULT_PAUSE_HOTKEY`）、`modals/SettingsModal.tsx`（录制 + 开关）、`App.tsx`（`launchPaused` state + 事件监听 + 传 prop）。**修复**：`toggleLaunchPaused` 传参类型收紧为 `boolean`；`SettingsModal` 补齐 `launchPaused` 解构 |
| 2 | 搜索结果定位回主界面 | ✅ 完成 | `main/index.ts`（`request-locate-app` handler：`showMainWindow()` + 向主窗口 `webContents.send('locate-app')`）、`main/preload.ts`、`shared/electron.d.ts`、`__audit__/mockApi.ts`、`App.tsx`（`onLocateApp` 监听 + `pendingLocateAppIdRef` + `scrollIntoView` + 加 `.locate-highlight`）、`SearchApp.tsx`（`locateResult` / `Ctrl+Shift+Enter` / 结果右侧「定位」按钮）、`index.css`（`.locate-highlight` 动画，含 reduced-motion 禁用） |
| 3 | 本机文件搜索 | ✅ 完成 | `main/fileSearch.ts`（纯函数 `normalizeEverythingRow` / `parseEverythingJson` / `dedupeByPath` / `probeEverything` + `searchEverything` / `isEverythingReachable`，支持 Basic Auth）、`main/fileSearch.test.ts`（13 项）、`main/fileSearch.everything.test.ts`（4 项，本地 HTTP 假服务端到端）、`main/everythingDetect.ts`（**新**，自动检测 Everything 安装 / 运行 / HTTP 端口，读 ini 按 mtime 合并）、`main/everythingDetect.test.ts`（25 项）、`main/handlers/fileSearchHandlers.ts`（`search-files` 返回 `{results, source, port}` / `detect-everything` / `get-icon-file-url` / `save-image-to-icon-cache`，均 `assertSender`）、`main/index.ts`（注册）、`main/preload.ts`、`shared/electron.d.ts`、`shared/types.ts`（`FileSearchResult` / `FileSearchResponse` / `FileSearchSource` = `'everything' | 'none'` / `EverythingStatus` + `Config.everythingHttpPort`）、`handlers/appHandlers.ts`（`open-path`，仅校验绝对路径 + 存在）、`SearchApp.tsx`（异步 + 防抖 + 防竞态 + 来源标签）。**修复**：`Config` 导入路径；**Everything 端口自动检测（不再需要手填）+ 请求补 `path_column`/`attributes_column` 列 + `path` 按「目录」语义与 `name` 拼完整路径 + 稳定排序 + 按完整路径去重 + 文件搜索改为纯 Everything 通道（内置索引与搜索目录已移除）** |
| 4 | 分类图片图标 | ✅ 完成 | `shared/types.ts`（`CategoryIconKind` / `ParsedCategoryIcon`）、`utils/categoryIcon.ts`（`parseCategoryIcon` / `encodeCategoryIcon` / `svgToDataUrl` / `isHttpImageUrl` / `categoryIconGlyph`）、`components/CategoryIcon.tsx`（新）、`components/CategoryIconPicker.tsx`（新）、`CategoryOverlays.tsx`（编辑器改用选择器）、`CategoryNav.tsx` / `AppGrid.tsx` / `App.tsx` / `AppContextMenuOverlay.tsx` / `CategoryManagerModal.tsx` / `SubcategoryManagerModal.tsx`（内联渲染）、`SelectionBar.tsx` / `AppDraftForm.tsx` / `SmartOrganizeModal.tsx`（下拉框用 `categoryIconGlyph`） |
| 5 | 搜索窗分组标题 + 来源标签 | ✅ 完成 | `SearchApp.tsx`（`resultSource` / `SOURCE_TITLES` / `resultGroups` 分组渲染 + 每项右侧来源标签 + 文件显示完整路径）、`search.css`（`.search-group-header` / `.search-result-tags` / `.search-result-source` / `.search-result-locate` / `.search-result-icon.file` / `.search-result-path-full`） |
| 6 | 验证与文档 | ✅ 完成 | `npm run typecheck`（三套 tsconfig）全绿；`npm test` **37 文件 / 393 项通过**；`npm run lint` 0 error；`npm run build` 通过。文档：`CHANGELOG.md`（v2.9.4 条目）、`README.md`（文件搜索 / 定位 / 暂停键 / 分类图片图标 / 快捷键表 / 数据文件）、本表 |

### P1 实现说明（2026-09-29）

- **文件搜索只走 Everything，绝不自己造索引**：早期版本带「内置索引兜底」（扫配置目录 + `fileIndex.json` 持久化）已被**整套移除**。用户明确要求"用端口连我电脑里现有的 Everything"，而不是再造一个残废版。没装 Everything 就没有文件搜索，设置页会引导安装并开启 HTTP 服务。
- **Everything 端口自动检测（2026-09-29 补 / 修正）**：以前 `everythingHttpPort` 默认 `0` 且无检测，等于永远走内置索引。现 `main/everythingDetect.ts` 自动解析端口：**ini 位置不止 `%APPDATA%\Everything`**——若关闭了「Store settings and data in %APPDATA%」或绿色版，活动 ini 在 **exe 同目录**；且 `allow_http_server` 只存在于 exe 同目录 ini。故读**全部候选 ini**（含经注册表定位的安装目录）后 `mergeIniCandidates` 按 mtime 从新到旧**逐键**取值（陈旧 `%APPDATA%` ini 不得覆盖安装目录活动 ini），再 `portFromIni`（`http_server_enabled !== true` 返回 `undefined`；启用未写端口按默认 80）。运行时用 `candidatePorts`（显式端口 > ini 端口 > 80 > 8080）+ `probeEverything` 兜底——Everything 可能尚未把设置写回 ini，磁盘上的 `enabled` 会滞后。`search-files` 走 `pickEverythingPort`（60s 工作端口缓存）。**HTTP 服务本身必须在 Everything 里开启**（工具 → 选项 → HTTP 服务器），这是唯一一步需要用户手动做的，设置页会明确提示。
- **搜索热路径禁止同步子进程**：搜索框唤出卡顿的根因是主进程 `execFileSync` 同步跑 `reg query`×3 + `tasklist` 阻塞事件循环。现全部改异步 `execFile`，并把检测拆两层——**端口层**（异步读 ini，注册表 5min 缓存，仅首次查一次）供搜索热路径用；**完整检测**（含 `tasklist` 等子进程，仅设置页触发）。渲染层**不再**在每次唤出搜索窗时做检测；启动时 `warmEverythingDetection()` 预热。
- **文件搜索门禁**：`SearchApp` 的门禁只看「非命令模式（`>`）且非搜索引擎激活态且有关键词」，不再依赖任何"搜索目录"配置——配了 Everything 就能搜到全盘。命令模式与搜索引擎激活态跳过文件搜索。
- **异步 + 防抖 + 防竞态**：`runSearch` 先同步给出命令/应用结果（即时反馈），再以 150ms 防抖异步叠加文件结果；`searchTokenRef` 递增序号丢弃过期请求，快速输入时旧结果不会覆盖新结果。文件结果返回前用 `filesLoading` 抑制「无结果」占位，避免空窗闪烁。
- **文件打开走独立通道**：`open-path` 只校验「绝对路径 + 存在」，**不做扩展名白名单**——文件搜索的意义正是打开那些不在 `LAUNCHABLE_EXTENSIONS` 里的文件。
- **`<option>` 不能渲染图片**：分类图标在原生下拉框里只显示 Emoji 字形（`categoryIconGlyph`），图片/网络/SVG 类返回空串，避免露出 `image:` / `url:` / `svg:` 编码前缀；所有内联渲染处统一走 `CategoryIcon` 组件。
- **`category.icon` 编码向后兼容**：纯字符历史值按 Emoji 处理；新形态用 `emoji:` / `image:` / `url:` / `svg:` 前缀，`parseCategoryIcon` 单点解析。
- **`.locate-highlight` 用 box-shadow 脉冲而非改背景**：卡片背景由主题玻璃变量控制，动画 `background-color` 会被主题规则干扰；改用品牌色描边脉冲更稳，且 `reduced-motion` 下禁用。
- **搜索窗高度用 `ResizeObserver` 持续同步**：窗口高度由渲染层实测 `.search-container` 高度后调 `resizeSearchWindow` 同步。以前用 `useLayoutEffect` 且 deps 漏了 `filesLoading` / 占位提示等高度来源 → 内容变高时窗口没跟着长 → 容器 `overflow:hidden` **裁掉底部圆角**（圆角显示异常的根因）。改用 `ResizeObserver` 监听容器尺寸变化，任何高度变化都能同步。
- **定位触发源用 nonce 而非状态比对**：目标卡片若恰在当前分类，`activeCategory` / `apps` 都不变，`[activeCategory, apps]` 依赖的 effect 不会重跑 → 窗口打开却无高亮。改为额外依赖自增的 `locateNonce`。
- **取消在途文件搜索**：`cancelFileSearch()`（递增 token + 清计时器 + 清 loading）在清空输入 / 激活引擎 / Escape / `resetAll` / `onResetSearch` 各路径调用；挂载期 effect 经 `cancelFileSearchRef` 调用，避免把它塞进空依赖数组。
- 🐞 **「文件搜索完全不工作」根因（已修）**：`SettingsModal.saveConfig` 用「受控字段白名单」重建 config，只把白名单里的 `overrides` 落盘，其余键被 `...config` 静默覆盖。`everythingHttpPort` 不在白名单 → 设置里改的端口保存后消失。修法是把 `...overrides` 放到合并**最后一步**（任何显式键都落盘），并加 `SettingsModal.test.tsx` 回归测试钉住。**这类"重建式合并"极易漏字段，以后往 `saveConfig` 加配置项要留意。**
- 🐞 **「多磁盘遗漏 + 同名文件夹/文件漏显冲突」根因（已修）**：三层叠加——
  ① `searchEverything` 只发 `json=1`，而官方 JSON 接口的 `path_column` / `size_column` / `attributes_column` **默认全为 0，不显式请求就完全不返回 `path`** → 解析时每条都因"无路径"被丢弃 → **Everything 恒返回空**。现请求显式带上这三列 + `sort=name&ascending=1`。
  ② **Everything 的 `path` 是「所在目录」而非完整路径** → 界面显示目录、`open-path` 打开目录；更致命的是渲染层用 `__file_${path}` 当 React key，**同目录多项 key 相同 → React 复用节点互相覆盖**（"同名漏显、冲突"的直接来源）。现按 `path` + `name` 拼完整路径（`basename(path)==name` 时视为已是完整路径），`isDir` 由 `type==='folder'` 或 `attributes & 0x10` 判定。
  ③ 排序/去重不当 → 同名文件里被整批挤掉。现按**完整路径**去重（`dedupeByPath`，**绝不按文件名去重**——多磁盘同名文件路径不同必须全留），limit 只减数量不改"谁被留下"。
  配套：`search-files` limit 上限 50→300 / 默认 20→100；渲染层请求 12→60 并按 `id` 去重合并。

---

## 实施进度（P2 · v2.9.5）

> P2 共 8 项。**P2-5（直角模式）按用户决策不做**（界面全部保留圆角），实际实施 7 项。
> 数据模型与 `validation.ts` 的清洗早已就绪，本轮补齐的是**渲染层 / 主进程的落地与设置页入口**。

| 步骤 | 内容 | 状态 | 落点与验证 |
|---|---|---|---|
| P2-1 | 自定义背景 | ✅ 完成 | `index.css`（`--app-bg-image/blur/dim/color` + `.app-bg-layer` / `.app-bg-dim`）、`App.tsx`（`getLocalImageUrl` 解析 → 写 CSS 变量 + 背景层 + `data-bg-kind`）、`handlers/appearanceHandlers.ts`（`select-file` / `get-local-image-url`）、`SettingsModal`（类型 / 颜色 / 图片 / 模糊 / 暗化） |
| P2-2 | 全局字体与缩放 | ✅ 完成 | `App.tsx`（`--ui-font` + `documentElement.fontSize`）、`SearchApp.tsx`（搜索窗是独立文档，单独应用一次）、`index.css` / `search.css`（`body { font-family: var(--ui-font) }`）、`SettingsModal`（字体族 / 字号缩放）。**字号缩放只动 rem，图标（px）与网格（px 计算）不受影响** |
| P2-3 | 分类字号与条目高度 | ✅ 完成 | `CategoryManagerModal`（编辑态加字号 / 条目高 / 图标尺寸，留空 = 默认）、`App.tsx`（`handleUpdateCategory` 接收 `appearance`）、`CategoryNav`（字号 / 图标尺寸）、`AppGrid`（`activeItemHeight` → `gridAutoRows: minmax(h, auto)`） |
| P2-4 | 自定义托盘图标 | ✅ 完成 | `main/index.ts`（`getTrayIcon()`：自定义图不存在 / 解码失败一律回退内置图标；>32px 先缩到 32×32）、`apply-tray-icon` IPC（改完立即换图，不必重启）、`SettingsModal`（选择 / 恢复默认） |
| P2-5 | ~~直角模式~~ | ⛔ 不做 | 用户决策：界面全部保留圆角。`UISettings.squareCorners` 已从类型与校验中删除 |
| P2-6 | 指定浏览器 | ✅ 完成 | `SettingsModal` 新增「项目」分区：浏览器列表增删改（名称可编辑 + 选择 .exe），落 `Config.browsers`。后端 `open-url-with-browser` / 网址项目指定浏览器此前已就绪 |
| P2-7 | 自动备份可配 | ✅ 完成 | `Config.backupEnabled/backupDir/backupKeep` + `validation.ts`、`backup.ts`（`resolveBackupDir`）、`main/index.ts`（按配置决定是否备份 / 落哪个目录 / 留几份）、`systemHandlers`（`open-backups-directory` 用同一解析函数）、`SettingsModal`（开关 / 目录 / 份数） |
| P2-8 | 自定义搜索占位符 | ✅ 完成 | `SearchApp.tsx`（`placeholder` 取 `config.ui.searchPlaceholder`）、`SettingsModal`（搜索区输入框，上限 60 字符） |

### P2 实现说明（2026-09-29）

- **外观设置统一写进 `documentElement` 的 CSS 变量**，而不是挂在 `.app-shell` 上：模态框、toast 这些浮层挂在 `.app-shell` 之外，挂在 shell 上它们拿不到。搜索窗是**独立文档**，主窗口写的变量不会带过去，所以 `SearchApp` 自己应用一次字体 / 缩放。
- **字号缩放走 `documentElement.style.fontSize`**：Tailwind 的 `text-*` 都是 rem，跟着缩放；而 Phosphor 图标传的是 px、网格列数与卡片尺寸也都是 px 计算——正好满足"不影响图标与网格尺寸计算"。
- ⚠️ **背景图不复制进 `icons/` 缓存目录**：`clear-icon-cache`（「刷新全部图标」）会删掉缓存里的 `.png/.ico/.jpg/.jpeg`，背景图放进去会被顺手清掉。改为**原地引用**用户选的绝对路径（`get-local-image-url` 换 `file://`），文件被移走就自动回退到主题背景。
- ⚠️ **`.app-bg-layer` / `.app-bg-dim` 必须是绝对定位**：`.app-shell` 是显式定位网格，所有**在文档流内**的直接子项都要写死 `grid-row`（漏写会被自动布局丢进某个格子）。绝对定位脱离文档流，因此不必去四处布局里补 `grid-column/grid-row`（`.aurora-bg` 同理）。
- **暗化遮罩不是装饰**：玻璃面板上的浅色文字全靠它保住对比度，图片模式默认给 0.35；纯色是用户自己挑的，不默认压暗。
- **托盘图标多尺寸 + 回退**：自定义图 >32px 先 `resize` 到 32×32（兼顾 200% 缩放），文件不存在 / 解码失败一律静默回退内置图标，绝不让托盘空掉。`apply-tray-icon` 与 `createTray` 共用 `getTrayIcon()`，保证"启动时"和"改完后"是同一张图。
- **备份目录用同一个解析函数**（`resolveBackupDir`）供"写备份"与"打开备份目录"两处调用，避免出现"打开的目录 ≠ 备份实际落地目录"。

---

## 实施进度（P3 · v2.9.10）

> P3 共 6 项，**代码全部落地**。已落地 P3-1、P3-2、P3-5；P3-3 / P3-4 / P3-6 经评估**决定不做**（依据见 §7「已拍板的决策点」）。
> 另外补做两项：**P3-7 默认搜索热键缺陷修复**（既有 bug）、**R7 便携版打包目标**（原为待拍板项）。

| 步骤 | 内容 | 状态 | 落点与验证 |
|---|---|---|---|
| P3-1 | 文本项目（笔记/待办） | ✅ 完成 | 查看 / 复制 / 编辑在 P0 前移落地（`modals/NoteViewerModal.tsx`）；P3 补上「待办」形态：`noteKind` + `todoItems` 数据模型、`utils/todo.ts` 纯逻辑、阅读面板直接勾选落盘、表单条目编辑器。**顺带修掉一个致命 bug：`note` / `group` 因 `path` 为空曾被 `save-apps` 整条丢弃**（见下） |
| P3-2 | 文件项目命令行工具 | ✅ 完成 | 数据模型 `openWith: { command, argsBefore, argsAfter }`；`shared/commandLine.ts`（新，纯函数，17 项测试）；主进程 `open-app-with` 通道 + `launchDetached`（**`shell: false`**）；表单「用指定程序打开」折叠区 + 命令行预览；右键菜单「用系统默认方式打开」 |
| P3-3 | 分类密码 | ❌ 已评估不做 | 数据是明文 JSON，且搜索窗 `SearchApp.tsx` 全量搜 `apps`（锁住的分类照样搜得到、回车即开），另有总览 / 使用情况 / 智能整理 / 组合成员 / 「移动到分类」等出口；防误触已有 `confirmBeforeLaunch`。收益 < 维护成本，且会给用户错误的安全预期 |
| P3-4 | 分类独立窗口 | ❌ 已评估不做 | 收益被「收纳格 + 全局热键 + 搜索结果定位回主界面」覆盖；成本是持续的双窗口维护（主题 / 背景 CSS 变量写在 `documentElement`，每个窗口都得各应用一次） |
| P3-5 | 配置预设导入导出 | ✅ 完成 | `main/preset.ts`（新，纯逻辑）、`main/preset.test.ts`（新，8 项）、`main/handlers/presetHandlers.ts`（新，`export-config-preset` / `import-config-preset`）、`shared/types.ts`（`PresetExportResult` / `PresetImportResult`）、`main/index.ts`、`preload.ts` / `electron.d.ts` / `__audit__/mockApi.ts` 三处登记、`SettingsModal`「项目」分区入口 |
| P3-6 | 搜索命令行工具 | ❌ 已评估不做 | 现状是**封闭集合**（`BUILT_IN_COMMANDS` + `quickActions` → `runUiCommand`）。扩成"任意 cmd / PowerShell 命令"等于把任意命令执行挂到一个**全局热键**上，与红线 11 冲突；边际收益只有"少按一次 Win+R" |
| P3-7 | 默认搜索热键缺陷 | ✅ 完成 | 默认值 `Ctrl+K` → **`Ctrl+Alt+K`**；新增 `searchHotkeyDefaultMigrated` 独立迁移标记 + `planSearchHotkeyDefaultMigration`；见下 |
| R7 | 便携版打包目标 | ✅ 完成 | `electron-builder.yml` 加 `portable` target；`CONFIG_DIR` 切到 `PORTABLE_EXECUTABLE_DIR`；更新器对便携版只给「打开发布页」；发布物挑选改为优先 `-Setup-`；见下 |


### P3-1 实现说明（2026-09-29）

**待办形态不做成新的 `AppItemType`。** 「待办」与「笔记」共用同一张卡片、同一套图标 / 搜索 /
右键菜单，只是正文的呈现与交互不同。新开一个类型要同步 `APP_ITEM_TYPES`、`get-apps` 读取兜底、
类型选择器、`groupLaunch` 白名单等一串地方，而这些地方没有任何一处需要区分。因此用
`noteKind: 'text' | 'todo'`（缺省 `text`，历史数据读出来就是笔记）+ `todoItems: TodoItem[]`。

- **数据与清洗**：`TodoItem { id, text, done }`；`sanitizeTodoItems` 丢掉空文本条目、**给缺失或重复的
  id 重新分配**（id 是 React key 与 toggle 的目标，重复 id 会导致"勾一条连带勾掉另一条"）、
  单条截断 500 字、总量截断 500 条。
- **纯逻辑**（`renderer/src/utils/todo.ts`）：`createTodoItem` / `countTodos` / `toggleTodoItem` /
  `updateTodoText` / `removeTodoItem` / `clearCompletedTodos` / `formatTodosAsMarkdown` / `summarizeTodos`。
  全部是"传入旧数组、返回新数组"，调用方直接丢给 `mutateApps` 落盘。
- **阅读面板**（`NoteViewerModal`）：待办形态渲染勾选列表，**点一下就落盘**——勾选是待办最高频的动作，
  要是每次都得开弹窗再保存，那就不叫待办了。改文字 / 增删条目仍走「编辑」，职责分开。
  完成态 = 删除线 + `aria-checked`，进度用 `aria-live` 播报。
- **表单**（`AppDraftForm`）：note 类型下加「笔记 / 待办」分段切换（复用 `.app-type-segment` 样式，
  不为两个按钮再写一份 CSS）；待办形态给条目编辑器（逐条输入 + 勾选 + 删除 + 添加）。
  **切形态不丢数据**——`buildTypeFields` 的 note 分支同时写回 `noteContent` / `noteKind` / `todoItems`。
- **复制**：待办导出成 Markdown 任务列表（`- [x]` / `- [ ]`）。粘到任何编辑器都看得懂，
  也还能被再解析回来；复制成纯文本会丢完成状态，复制成 JSON 又没人看得懂。
- **面板数据来源改成 id**：`App.tsx` 的 `viewingNote` 由 `AppItem` 对象改为按 id 从 `apps` 派生。
  存对象快照的话，勾完一条界面不会更新（还是打开那一刻的旧值）。

#### ⚠️ 顺带修掉：`note` / `group` 曾被 `save-apps` 整条丢弃

排查上面这条链路时发现的既有严重 bug，影响范围远超 P3-1：

- `sanitizeAppItem` 的必填校验是 `if (!id || !name || !appPath) return null`——**要求 `path` 非空**。
- 而 `note` 与 `group` 的 `path` 在表单里固定存空串（渲染层 `APP_TYPE_REQUIRES_PATH`）。
- 结果是 `save-apps` 走 `sanitizeAppsData` 时把它们**整条 filter 掉**：用户点保存、界面提示成功，
  卡片却再也没出现过。`systemHandlers` 的"恢复损坏备份"走同一个函数，同样会丢。
- 修法：主进程补一份 `APP_TYPE_REQUIRES_PATH`（`app` / `folder` / `steam` / `url`），
  **只对这些类型要求路径**。主进程不能 import 渲染层那份常量，所以两边各自维护，注释里互相指向。
- 之所以一直没被发现：单测覆盖的是纯函数（`appUpdate` / `todo` / `preset`），
  没有一条测试穿过"渲染层草稿 → 主进程 `save-apps`"这条链路；而 fixtures 是渲染层假数据，不经主进程。
  现已补上回归测试（`validation.test.ts` 的「无路径类型」一组）。

### P3-2 实现说明（2026-09-29）

**「用指定程序打开」= 命令模板，不是自由命令行。** 形状固定为
`[命令] [路径前参数] [项目路径] [路径后内容]`——路径**夹在中间**。这样一条模板同时覆盖两种常见惯例：

- `code --goto <file>`（参数在路径前）；
- `tool -n <file> -nosession`（参数在路径前后都有）。

不做成"随便写一整行命令 + 占位符替换"的原因：那样用户得记住占位符语法，而实际用到的场景里
路径位置就那么两种，固定形状更省心。

- **数据模型**：`OpenWithCommand { command, argsBefore?, argsAfter? }`，挂在 `AppItem.openWith` 上。
  **只有 `app` 与 `folder` 两种类型会带它**（`buildOpenWith` 对其它类型直接返回 `null`）。
- **纯函数**（`shared/commandLine.ts`，新）：`splitCommandLine` + `formatCommandPreview`。
  主进程用它把参数串拆成数组交给 `spawn`，渲染层用它拼出「最终命令预览」。
  ⚠️ **刻意不依赖 `node:path` 或任何 Node 内置模块**——渲染层（Vite）拿不到。
  规则按 Windows 的 `CommandLineToArgvW` 惯例：双引号保留空格、`\"` 转义、**单引号不是特殊字符**
  （Windows 与 POSIX 最容易被搞混的一点）、`""` 产生一个空参数、连续空白不产生。
- **安全边界（本项的核心）**：
  1. **`spawn(command, argsArray, { shell: false })`**——参数**绝不拼成字符串再交给 shell**，
     否则用户填的 `&` `|` `%VAR%` 会被解释成命令分隔符，等于把任意命令执行交出去。
  2. **命令白名单收窄到 `.exe`**：`.bat` / `.cmd` 交给 `spawn` 跑不起来，要跑得套 `cmd.exe /c`，
     那等于把 shell 请回来。所以宁可只放行 `.exe`。
  3. **路径与命令都过 `resolveAndAssert`**（P0-4 的相对路径解析 + 绝对路径校验）。
  4. **参数本身无法白名单**（路径能限成可执行文件，参数是任意字符串），
     所以"不经过 shell"就是唯一防线——这也是为什么 `shell: false` 不能改。
- **失败反馈**：`spawn` 的失败是**异步**的（`'error'` 事件），不会 throw。`launchDetached`
  同时监听 `once('spawn')` 与 `once('error')`，只有真的起来了才 `unref()` 并返回 `true`；
  用 `settled` 标志防止两个事件都触发时重复 resolve。
- **`open-url-with-browser` 一并收口**：原先它内联的 `spawn` 没有 `shell: false`，
  现抽成同一个 `launchDetached`，顺手补上。
- **不静默回落**：命令失效（程序被卸载 / 挪走）时**不会**偷偷改用系统默认方式打开——
  用户明确指定过用哪个程序，静默换一个只会让人以为点错了。想临时绕过就走右键菜单的
  「用系统默认方式打开」（`handleOpenAppWithSystem`，仅配了 `openWith` 时才显示）。
- **界面**：`AppDraftForm` 加「用指定程序打开（可选）」折叠区（选程序 / 路径前参数 / 路径后内容 /
  命令行预览 / 说明文字）；程序选择走 `safePickFile({ extensions: ['exe'] })`。
- **测试**：`commandLine.test.ts`（17 项，含单引号不是特殊字符、`""` 空参数、未闭合引号）、
  `AppDraftForm.openWith.test.tsx`（17 项）、`AppContextMenuOverlay.test.tsx`（7 项）、
  `validation.test.ts` 追加 `sanitizeOpenWith` 一组。

### P3-5 实现说明（2026-09-29）

- **只收录能搬走的偏好**：`ui` / `autoCategoryRules` / `quickActions` / `searchEngines` / `envVars` / `browsers`（在计划原文 5 项之外补了 `browsers`——它同样是"换机器也想带走"的偏好）。刻意排除 `apps` / `categories` / `collections`（那是数据，走数据备份）、以及 `hotkey` / `windowPosition` / `everythingHttpPort` / `portableRoot` / `backupDir` / `trayIcon` / `background` 里的绝对路径（与具体机器绑定，导过去大概率是错的甚至被占用）。
- **导入不落盘**：主进程只做「读文件 → 校验格式 → 合并 → 过 `sanitizeConfig`」，返回合并后的完整配置，**写入仍走渲染层既有的 `saveConfig` 链路**。这样写入只有一条路径——损坏数据保护、快捷键重注册、失败提示全都复用，不必在导入里重写一遍。
- **用 `in` 判断字段存在，而不是取值判空**：显式导出的空数组（"我要清空所有环境变量"）也必须能生效，否则又是「改了没反应」那一类坑。
- ⚠️ **`sanitizeConfig` 对 `searchEngines` 是"与默认值取并集"而不是整体替换**（既有行为：内置引擎无法通过保存被删掉）。所以导入预设后，内置引擎会重新出现。这是既有语义，改它会波及正常保存链路，不在本次范围——已在测试里显式断言，避免以后误以为是新 bug。
- **导入后要重置本地 state**：`ui` / `quickActions` / `envVars` / `browsers` 在设置页各有独立输入框与本地 state，不同步的话面板会继续显示导入前的旧值（`searchEngines` 是直接读 prop，不用管）。

### P3-7 默认搜索热键缺陷修复（2026-09-30）

**`Ctrl+K` 作为全局热键是一个错误，不是口味问题。** `globalShortcut.register` 一旦成功就是
**系统级独占**：装上之后，浏览器聚焦地址栏、VS Code 删行、Word、Slack、Gmail 等**所有软件**的
`Ctrl+K` 都会被本应用吞掉，而且不报错——用户只会觉得"某些软件突然不好用了"。

主热键当初从 `Alt+Space` 改成 `Ctrl+Alt+Space` 用的判据（不占系统保留键 / 不占主流高频键）
**漏用在了搜索热键上**。由此提炼出判据：**全局热键默认值一律用「双修饰键 + 字母」**
（`Ctrl+Alt+X` 这种形状），单修饰键 + 字母（`Ctrl+K` / `Alt+F`）几乎一定与主流软件冲突。

- **默认值**：`shared/defaults.ts` 的 `DEFAULT_SEARCH_HOTKEY` 改为 `Ctrl+Alt+K`，
  旧值保留为 `LEGACY_DEFAULT_SEARCH_HOTKEY`。
- **迁移标记必须独立**：新增 `Config.searchHotkeyDefaultMigrated`，**与 `hotkeyDefaultMigrated` 分开**。
  共用一个标记的话，两个热键里只有一个被迁移时，另一个就永远不再被检查了。
- **迁移只动"还是默认值"的用户**：`planSearchHotkeyDefaultMigration` 只有在
  `searchHotkey === LEGACY_DEFAULT_SEARCH_HOTKEY` 且标记为假时才返回迁移计划；
  自己改过快捷键的用户不受影响。
- **提示文案分开**：主热键的迁移提示说"被 Windows 系统保留"，
  搜索键的说"是系统级独占的，会把其它软件的 Ctrl+K 一并抢走"——两者的原因不一样，混成一句会说不清。
- **测试护栏**（`shared/defaults.test.ts`）：默认值不能是旧 `Ctrl+K`、必须 ≥ 2 个修饰键、
  不能与降级候选撞车；`planSearchHotkeyDefaultMigration` 5 条覆盖迁移 / 不迁移 / 幂等。

### R7 便携版（2026-09-30）

**便携版的关键不在"加一个 target"，而在数据目录。** 只加 `portable` target 得到的是
"免安装版"——它照样把数据写进 `%APPDATA%`，换机器等于从零开始，和"便携"没关系。

- **数据目录**：`main/config.ts` 的 `resolveDataRoot()` 优先用 `process.env.PORTABLE_EXECUTABLE_DIR`。
  ⚠️ **不能用 `process.execPath` 的目录**——便携版运行时会把自身解压到一个临时目录再启动，
  用 execPath 定位等于把数据写进临时目录，每次启动都是全新的。
  `PORTABLE_EXECUTABLE_DIR` 才是"用户把 exe 放在哪"。
- **便携版不能自更新**：现有更新链路是把 NSIS 安装包交给一个助手进程执行，
  而便携版就是正在运行的那个 exe，无法自我替换。因此 `check-for-update` 对便携版返回
  `portable: true` / `releaseUrl` 且 `downloaded: false`，`download-update` / `install-update`
  直接拒绝；界面把「下载更新」换成「打开发布页」。
- **发布物挑选必须优先 `-Setup-`**（`main/update/assets.ts`）：同一个 release 同时挂
  `-Setup-` 与 `-Portable-` 两个 exe，按"第一个 .exe"挑会把不能安装的便携版当安装包下下来。
  `pickInstallerAsset` 优先匹配 `-Setup-`，找不到才退回第一个候选（**不把老用户挡在更新之外**）。
  该模块抽成纯函数并单测（11 项，含"同时存在安装版与便携版时挑安装版"）。
- **配置**：`electron-builder.yml` 的 `win.target` 加 `portable`（x64），
  `portable.artifactName: ${productName}-Portable-${version}.${ext}`。

### 启动参数 / 起始位置接线（2026-09-30）

**这是一处死配置。** 表单里的「启动参数」「起始位置」能填、能存、能过清洗，
但全项目**零读取点**；启动走的是 `shell.openPath(safePath)`，而它**既不能传参也不能设 cwd**。
设置页的环境变量说明还宣称这两项支持 `%KEY%`——文案在说谎。

选择**接线**而不是删字段，理由是 `openWith` 表达不了"同一个 exe 带不同参数 / 不同 profile"。

- **启动分派收口**：新增 `renderer/src/utils/launchApp.ts`，三个入口
  （主窗口卡片 / 搜索窗结果 / 组合启动成员）共用同一套规则：
  `__folder_path__` → steam → url（按 `resolveUrlBrowser` 选浏览器）→ `openWith` → folder → 普通启动。
  顺带修掉一个既有的静默不一致：**搜索窗此前会忽略 `openWith`**，同一个项目在主界面点走指定程序、
  在搜索框回车却走系统默认关联。
- **主进程**：`openAppTarget(rawPath, extras)` 统一处理。带参数时若目标是 `.exe` 就走
  `launchDetached(path, args, { cwd })`，否则警告并回落到 `shell.openPath`（**不静默改行为**）。
  `SPAWNABLE_EXTENSIONS = ['.exe']` 与 `LAUNCHABLE_EXTENSIONS`（含 `.lnk` / `.bat` / `.cmd` / `.msc`）
  是**两个不能混用的集合**——后者能"打开"但 `spawn` 不了。
- **参数只展开 `%KEY%`，不套相对路径规则**：参数是任意字符串，套路径规则会把它改坏。
  新增 `expandIncomingEnvVars()` 专做这件事。
- **起始位置必须 `statSync().isDirectory()`**：否则 `spawn` 报 `ENOENT`，
  会被误读成"程序启动失败"而不是"起始位置填错了"。
- **提权启动也要带参数**：`open-app-as-admin` 的 PowerShell 脚本用**完整单引号字面量**逐项拼接
  （`'` 转义成 `''`），参数串经 `formatWindowsArguments` 转换——`Start-Process -ArgumentList`
  只接受字符串，这是**唯一**不得不走"数组 → 字符串"的通道。`shared/commandLine.ts` 因此新增
  与 `splitCommandLine` 对偶的 `formatWindowsArguments`，并配了对偶性测试（拆分再拼回语义不变）。
- **界面**：设置页环境变量说明补「注：『启动参数 / 起始位置』只对 `.exe` 程序生效。」；
  表单里非 `.exe` 的「用指定程序打开」给琥珀色警告。

### 入口可达性修复（2026-09-30）

**起因**：用户问"关联文件夹同步怎么实现，我怎么没找到入口"。查证后发现入口问题比预想严重——
它只是表象，底下是**两个整块功能没有渲染点**。

#### ⚠️ `CategoryManagerModal` / `SubcategoryManagerModal` 是死代码

两个组件都写完了（添加 / 编辑 / 删除分类，含 P2-3 的分类外观字段），但**全仓没有任何地方渲染它们**——
`App.tsx` 的 import 列表里都没有。后果：

- **P2-3「分类字号 / 条目高度 / 图标尺寸」的编辑入口不可达**。设置项做在这个死组件里，
  而 `CategoryNav` / `CategoryIcon` / `SearchApp` 都**会读取** `cat.fontSize` 等字段渲染——
  "功能实现了，界面入口不存在"。
- 我上一轮给出的"方案 A：管理分类弹窗里加一栏"**前提本身就是错的**（假设那个弹窗在界面上）。

**教训**：判断"界面能不能用到"必须 **grep 渲染点**（`<组件名`），
不能只看组件文件存在、也不能只看单测通过——这两个组件从来没有测试引用过它们。

#### 落地的三处

1. **接线 `CategoryManagerModal`**：`useCategoryDialogs` 新增 `categoryManagerOpen` /
   `openCategoryManager` / `closeCategoryManager`。入口两处 ——
   侧边栏按钮组的**「管理分类」**按钮（`CategoryNav` 新增 `onManageCategories`），
   与分类右键菜单「全部」分支的**「管理分类…」**。
   `CategoryCrudApi.handleUpdateCategory` 补 `appearance?` 参数（`handleUpdateCategory` 早已支持）。
2. **弹窗内加「关联文件夹」一栏**（编辑态，与「外观」并列）：未关联 → `选择文件夹…`；
   已关联 → 路径 + `立即同步` / `更换` / `解除`。非编辑态给一个链环角标。
3. **空分类引导**：`AppGrid` 新增 `activeCategoryObject` + `onBindFolder`，
   空状态在"有当前分类且未关联"时换成「这个分类还没有内容」+ `关联文件夹…` 按钮。
   ——这是关联文件夹最容易被发现的时机：用户正盯着空白，也还没养成右键分类的习惯。

#### 绑定对话框：是非题里塞了三个选项

原实现 `confirm('是否同时同步子文件夹内容？选择"取消"表示只同步这一层。')`。
**"取消"同时背上"不含子文件夹"和"算了不弄了"两个意思**——按哪个理解都对，
所以怎么实现都会有人觉得反了。

新增 IPC **`show-choice`**（`systemHandlers.ts`）：返回被点按钮**下标**，
`null` = **没问成**（来源不合法 / 窗口已销毁 / 参数不合法），调用方一律按"什么都不做"处理。
`buttons` 过滤空串、限 4 个、每个截 40 字；`defaultId` / `cancelId` 越界回退；
带 `noLink: true`（关掉 Windows 命令链接样式，否则选项一多会撑成一列大卡片）。
三处登记：`preload.ts` / `shared/electron.d.ts` / `__audit__/mockApi.ts`。

`handleBindFolder` 改为 `['仅本层', '含子文件夹', '取消']`（`defaultId: 0` / `cancelId: 2`）。
**反馈也一并明确化**：`useFolderSync.bindFolder` 改为返回 snapshot，
提示里带上实际结果——"已同步 N 个条目" / "已同步 0 个条目——这个文件夹目前是空的" /
"这次没能读到目录内容（上方横幅里有原因）"。以前只说"已关联"，
目录是空的还是读不出来完全看不出来。

#### 侧边栏拖拽热区

`.sidebar-resize-handle` 是 `grid-row: 2 / 4`，而两种布局的侧边栏实际都是 row 2 到第 4 行结束
（command-rail 的 `.category-nav` 是 `2/5`；studio-split 是 `.category-nav`(2) 接
`.subcategory-nav`(3/5)）——**侧边栏最高那一段没有热区**，且热区只有右边缘 14px 宽。

现改为**整个侧边栏任意位置都能拖**（见「P3-8 侧边栏拖拽热区」实现说明，含阈值三条硬规则）。

---

### 分栏视图空白 + 搜索同步条目（2026-09-30）

#### ⚠️ 分栏工作室布局「上半屏空出一大片」的根因

用户报「分栏视图布局存在显示问题 / 主界面存在一大片异常空白」。用几何探针
（`.audit/layout-probe.mjs`，CDP 直连真实 App 渲染）量出 1280×800 下的实际网格：

```
修复前：gridTemplateRows = 134.5px | 423px | 0px | 242.5px | 0px
        .app-content rect = [240, 570, 1040, 231]   ← 上半屏 435px 全空
修复后：gridTemplateRows = 134.5px | 0px | 0px | 665.5px | 0px
        .app-content rect = [240, 147, 1040, 654]   ← 紧贴头部下方，高度锁进窗口
```

根因是 `.layout-studio-split .category-nav` **只声明了 `grid-row: 2`**。
第 2 行是 `auto`——高度由分类列表的内容撑开。分类一多，这一行就长到 423px，
而 `.app-content` 位于第 **3 / 5** 行，于是整个右栏被推到窗口底部。

修法：分类栏改 `grid-row: 2 / 5`（与 command-rail 一致）+ `overflow-y: auto`，
列表在栏内滚动而不是把行撑高。**这类"内容撑高 auto 行"的问题必须靠几何探针量化，
靠肉眼看代码看不出来**。

同一轮顺带修掉两处：分类栏末尾的四个按钮（+ 分类 / + 子分类 / + 收纳格 / 管理分类，
实测共 306px）在 240px 宽的栏里被 `overflow-x: hidden` **整条裁掉**，最后那个按钮
在界面上根本不存在 → 允许换行；分类栏下沿是方角（只写了上面两个圆角，等子分类栏收尾，
而子分类栏在该布局下 `display: none`）→ 四角统一 18px。

#### 搜索窗搜不到关联文件夹同步出来的条目

两个窗口是**两套独立的渲染进程**：主窗口 `useFolderSync` 内存里的快照 / 图标缓存
过不到搜索窗，于是同一个文件夹里的东西在主界面看得见、在搜索框里搜不到。

修法：把「快照 → AppItem」的逻辑抽成一份共用的 `utils/syncedApps.ts`
（`flattenSyncedApps`，主窗口与搜索窗都调它），搜索窗在 `loadData` 时自己读
`folderCache.json` 并让同步条目与手工项目**一起参与过滤与排序**。
搜索结果里按 Delete 隐藏同步条目，会写回该分类 `linkFolder.hiddenPaths`
（**不写 `apps.json`**——那是用户意图与扫描缓存的分界线）。

#### 删除分类的文案与真实行为不符

`CategoryManagerModal` 的确认文案写「该分类下的项目将移到『其他』分类」，
但**并不存在这样一个分类**：`removeCategoryFromApps(keepApps = true)` 把
`categoryId` / `subcategoryId` 置 `null`，项目回到「全部」视图。
已按真实行为改写为「该分类下的项目将保留，并回到『全部』视图」，
`App.tsx` 里同一处的注释一并更正。

#### 提示文案术语统一

全仓过了一遍用户可见文案：统一「项目 / 分类 / 子分类 / 关联文件夹 / 文件夹同步 /
图标缓存」等称呼；中文引号统一为「」；确认句统一为「……吗？」；省略号统一为「…」；
口语化表述（「点一下」「记点什么」「还没填」「搞定」）改为规范说法。
**只改文案，不动行为**；配套更新了断言这些字符串的测试。

### 失效路径重定位 + 死代码审计（2026-09-30）

#### ⚠️ `validate-apps` 把网址 / 商店应用 / 文本项目一律判成「失效」

`validate-apps` 原实现对每个项目一律 `fs.promises.access(path)`。
问题在于 **`path` 字段是个"启动目标"，只有 `app` / `folder` 才真的是磁盘路径**：

| 类型 | `path` 里存的是什么 | `fs.access` 的结果 |
| --- | --- | --- |
| `app` / `folder` | 真实磁盘路径 | 正确 |
| `url` | 网址本身（见渲染层 `launchAppTarget`） | 必然失败 |
| `steam` | `steam://…` | 已被单独分支挡掉 |
| `app`（商店 / UWP） | `shell:AppsFolder\<AUMID>` 虚拟目录目标 | 必然失败 |
| `note` / `group` | 空串（表单恒存空串，见 `APP_TYPE_REQUIRES_PATH`） | 必然失败 |

后果不止是"数字难看"：整理中心把这三类统计进「失效」计数，而
「清理失效项」与「一键修复」**拿到这份结果就直接删**——
用户点一下一键修复，网址和商店应用会一起消失。

修法：把判定抽成纯函数 `main/appTargetCheck.ts` 的 `classifyAppTarget()`，
按类型分流（网址看是否带协议 / Steam 看 `steam://` 前缀 / 商店应用看 AUMID 形态 /
文本与组合恒有效 / 其余才 `needs-fs-check`）。
抽出来的第二个理由：handler 挂在 `ipcMain` 上，单测里起不来，
而这段代码**会误删用户数据**却一直没有测试——现在 `appTargetCheck.test.ts` 按类型逐个钉住。

⚠️ 一个容易踩的细节：`^[a-z][a-z0-9+.-]*:` 这条"带协议地址"的正则**也匹配 `C:\Tools`**，
所以 url 分支必须**先按类型限定住**；一旦有人把它提到类型判断之前，
所有盘符路径都会被当成合法网址、再也不用查盘了。测试里专门有一条断言防这个。

#### 新增：失效路径批量重定位（`handleRelocateInvalidApps`）

「清理失效项」和「一键修复」对失效项目只有一条出路——删。但用户真正遇到的多半是
**把整个文件夹搬走了**（换盘、改目录名、归档到资料盘），删掉重建最亏：
分类、别名、启动参数、待办、使用统计全都得重配一遍，而这些恰恰是最值钱的部分。

流程：校验失效项 → `safePickFolder()` 选**一次**新父目录 → 算候选（纯函数）
→ **回主进程实测** → 按结果分流。

换算规则（`utils/maintenance.ts` 的 `buildRelocationCandidates`）：
取这批失效路径的**公共目录前缀**（按 `\` 分段、忽略大小写），把它之后的部分
拼到新父目录后面。

- `D:\Tools\Alpha\a.exe` + `D:\Tools\Beta\b.exe`，公共前缀 `D:\Tools`
  → 选 `E:\Backup\Tools` 得到 `…\Alpha\a.exe`、`…\Beta\b.exe`
- 只有一条失效项时，公共前缀就是它自己的目录，相对尾部 = 文件名
- 跨盘（无公共目录）时退化成"只按文件名找"——此时任何"相对结构"都是编出来的

⚠️ 候选**必须实测才算数**：纯函数只做字符串换算，拼出来的路径完全可能不存在
（用户选错目录）。所以候选要再走一次 `validateApps`，命中的才更新。

「命中的更新 + 未命中的移除」与「只更新命中的、剩下的留着」是**两件事**，
用 `confirm` 问必然把「取消」的解释权搅乱 → 走 `showChoice` 三选一。
（顺带把此前"已无调用方"的 `show-choice` 通道重新接上，不必再纠结删不删。）

#### 新增：「移出收纳格」

卡片拖进收纳格之后**出不来**：拖到别的格子只是换格子，删掉收纳格又会连格一起没。
`useCollections` 里其实一直有 `removeAppsFromCollections`，但零调用方
（是"死代码"还是"缺接线"取决于有没有这条出口——确认没有之后判定为**缺接线**，
而不是删掉）。现接到项目右键菜单，菜单里只在卡片确实位于当前视图的收纳格内时出现，
收纳格名放 `title`（菜单是固定宽度 `w-52`，名字长了会被截断成半个字）。

#### 死代码审计结论

判定口径是**"谁 import 了这个模块/符号"**，不能全仓搜符号名——同名符号会跨文件"顶包"
（`ALL_FILE_EXTS` 在 `renderer/src/utils/fileUtils.ts` 与 `shared/utils.ts` 各有一份，
前者是死代码、后者在用，全仓 grep 会漏判）。
最终：真死代码 0 项（本轮已清空）、无人 import 的模块 0 项。
明细与「影响范围」逐条记在 `CHANGELOG.md` 的「内部清理（不影响使用）」一节。

⚠️ 两条审计陷阱，下次别重犯：

1. **IPC 审计不能按通道字符串 grep 渲染层**。渲染层调的是 preload 的方法名
   （`electronAPI.hideSearchWindow()`），不是通道名（`'show-search-window'`）。
   第一版按通道名搜，报出 74 个"无调用方"，全部是假阳性。
2. **`.d.ts` 的 ambient 类型不走 import**。`UpdateInfo` / `PathInfo` / `DataHealth` 等
   看似零引用，实际被 `interface Window` 内联引用，属误报。

---


## 0. 结论先行（TL;DR）

1. **Dawn 是"启动器"，tidy-desktop 是"整理器 + 启动器"。** Dawn 强在入口类型全、外部同步、唤出方式多、外观可玩；tidy-desktop 强在数据可靠性、长期维护能力、主题与布局体系。
2. 当前最大的**能力缺口是"启动器基本盘"**：tidy-desktop 只能装程序 / 文件夹 / Steam 链接，**不能装网址、不能装文本、不能一次开一组**，也没有任何"文件夹内容自动同步"能力。这四条是 Dawn 免费版就有的东西，补上它们对"看起来像个完整启动器"的边际收益最高。
3. **四个阶段，版本号按 patch 序列推进，每阶段可独立发版**：
   - **P0 · v2.9.3 启动器基本盘**：网址项目、组合启动（多项目运行）、收纳格、关联文件夹、相对路径 + 环境变量、**默认热键修复**
   - **P1 · v2.9.4 唤醒与搜索**：本机文件搜索（Everything 可选集成 + 内置降级）、搜索结果定位回主界面、暂停快捷键、分类图片图标
   - **P2 · v2.9.5 外观与个性化**：自定义背景、全局字体与缩放、分类字号/条目高度、自定义托盘图标
   - **P3 · v2.9.10 进阶与安全**：文本项目、文件项目命令行工具、分类密码、分类独立窗口、配置预设导入导出
   - v2.9.6 – v2.9.9 四个号段**预留**，留给 P0–P2 落地过程中出现的紧急修复版本。
4. **已决策：鼠标手势唤出（双击 Ctrl / 双击 Alt / 鼠标侧键 / 双击左键）本次不做。** 它需要引入 `uiohook-napi` 一类原生模块，会打破项目"纯 JS 依赖、打包简单"的现状，收益（多几种唤出方式）与代价（electron-builder 需 rebuild、可能被杀软误报、与现有全局热键冲突）不成比例。**打包链路维持现状**，此项保留在 §7 R1 作为将来可选方向。
5. **已决策：默认主窗口热键由 `Alt+Space` 改为 `Ctrl+Alt+Space`。** 理由、降级链与老用户迁移方案见 **§5.6**。这是对"全局热键开箱即死"这个现存缺陷的正面修复，也顺手解除了 P1「暂停快捷键」的前置阻塞。
6. **不建议照抄 Dawn Pro 的深度定制**（如分类独立窗口的吸附行为、命令行工具的参数编排）。它们实现成本高、与 tidy-desktop 的"整理"气质不符，且会显著增加主题与拖拽两个高危区域的复杂度。

---

## 1. 两个产品的定位差异

这一节决定了"哪些该抄、哪些不该抄"。

| 维度 | Dawn Launcher | tidy-desktop 现状 |
|---|---|---|
| 一句话定位 | 把桌面快捷方式收进一个分类网格，快速搜、快速开 | 把散落的入口归类并长期维护，顺带能搜能开 |
| 入口类型 | 程序 / 文件夹 / **网址** / **文本** / **收纳格** | 程序 / 文件夹 / Steam 链接 |
| 外部同步 | **关联文件夹**（实时同步目录内容） | 无（只有一次性导入快捷方式） |
| 启动方式 | 单个 / **组合（多项目运行）** | 单个 |
| 唤出方式 | 全局热键 + 双击 Ctrl / 双击 Alt / 鼠标侧键 / 双击左键 / 托盘 | 全局热键（主窗口 + 搜索窗）+ 托盘 |
| 搜索 | 应用 + **本机文件（Everything）** + **命令行（`>` 模式）** | 应用 + 搜索引擎前缀 + 路径直开 + `>` 命令模式 |
| 数据存储 | SQLite（V3）/ JSON（V1-V2），备份靠手动 + 可配自动备份 | JSON 原子写 + 每日自动快照 + 损坏文件隔离 |
| 外观 | 主题 / 背景 / 圆角 / 字体 / 分类字号 / 托盘图标，可玩性高 | 5 主题 × 3 布局 + 强调色 + 卡片尺寸，**体系更严谨**（WCAG 校验过） |
| 维护能力 | 弱（没有失效清理 / 图标补全 / 自动分类） | **强**：整理中心（失效清理、图标补全、空分类清理、自动分类、隐藏恢复、快捷方式导入、备份） |
| 数据安全 | 一般 | **强**：tmp+rename 原子写、jsonTransaction 崩溃恢复、`.corrupt-<ts>` 隔离、每日备份保留 N 份 |
| 技术栈 | V1/V2 Electron → **V3 起改为 Tauri + Rust + SQLite** | Electron + React + TS + JSON 文件 |

**核心判断**：tidy-desktop 的护城河是「**数据可靠 + 长期可维护 + 视觉一致**」。对标 Dawn 时应**优先补齐入口类型与同步能力**（这是"启动器"的定义域），把深度外观定制**降级**，绝不为了抄功能破坏现有数据安全与主题体系。

---

## 2. 功能覆盖度矩阵

图例：✅ 已有 ｜ 🟡 部分/需增强 ｜ ❌ 缺失 ｜ ⛔ 本次不做

### 2.1 Dawn 免费版基础能力

| # | Dawn 功能 | tidy-desktop 现状 | 差距说明 | 建议 |
|---|---|---|---|---|
| 1 | 快捷启动（点开即启动） | ✅ | — | — |
| 2 | 分类 / 子分类 | ✅ | 已支持两级 + 拖拽排序 + 分组显示 | — |
| 3 | 快速搜索 | ✅ | 支持多关键词 / 拼音 / 首字母 / 别名 / 路径 | — |
| 4 | **添加网址 + 一键获取网址信息** | ❌ | `AppItem.type` 无 `url`；无标题/favicon 抓取 | **P0 / v2.9.3** |
| 5 | **关联文件夹（实时同步）** | ❌ | 无目录监听、无同步模型 | **P0 / v2.9.3** |
| 6 | **相对路径（便携路径）** | ❌ | 路径一律绝对存储 | **P0 / v2.9.3** |
| 7 | 扫描开始菜单 | ✅ | `scan-shortcuts` 扫桌面 3 处 + 开始菜单 2 处（.lnk） | 增强（见 #8） |
| 8 | **扫描本机 Appx（Store 应用）** | ❌ | 只扫 `.lnk`，Appx 走的是 AUMID，需要 `Get-StartApps` | **P0 / v2.9.3** |
| 9 | **多项目运行（组合启动）** | ❌ | 无组合实体、无批量启动 IPC | **P0 / v2.9.3** |
| 10 | **分类图标（图片 / Emoji / 网络 / SVG）** | 🟡 | `Category.icon` 是字符串，实际只用了 Emoji | **P1 / v2.9.4** |
| 11 | 自定义主题 | ✅ | 5 套主题 + 3 种布局 + 强调色，比 Dawn 更成体系 | — |
| 12 | **自定义背景** | ❌ | 无背景图/模糊/暗化能力 | **P2 / v2.9.5** |
| 13 | **搜索结果定位到主界面项目** | ❌ | 搜索窗结果点击即启动，没有"跳回主界面并选中" | **P1 / v2.9.4** |
| 14 | 便携版 | ❌ | `electron-builder.yml` 只出 NSIS 安装包 | **待决策**（见 §7 R7） |

### 2.2 Dawn 3 Pro 进阶能力（22 项）

| # | Dawn Pro 功能 | tidy-desktop 现状 | 建议 |
|---|---|---|---|
| 1 | 全新主界面（多界面样式） | ✅ 已有 3 种布局 | — |
| 2 | 隐藏主窗口标题栏（Alt+拖动移动） | ✅ 无边框窗口 + 自绘标题栏 | — |
| 3 | 禁用界面圆角（直角模式） | ⛔ | **不做**（2026-09-29 决策）：界面全部保留圆角，不提供该开关 |
| 4 | 集成 Everything 搜索 | ❌ | **P1 / v2.9.4** |
| 5 | 快速搜索命令行 | 🟡 已有 `>` 命令模式（仅执行内置 UiCommand） | **P3 / v2.9.10** |
| 6 | 全新子分类界面（多种展示方式） | 🟡 已有子分类条 + 分组区 | **P2 / v2.9.5** |
| 7 | 分类独立窗口（置顶/吸附） | ❌ | **P3 / v2.9.10**（成本高、收益窄） |
| 8 | 自定义分类字体与高度 | ❌ | **P2 / v2.9.5** |
| 9 | 自定义分类图片图标 | 🟡 同免费版 #10 | **P1 / v2.9.4** |
| 10 | 分类密码 | ❌ | **P3 / v2.9.10**（须明确"防误触非加密"） |
| 11 | 收纳格 | ❌ | **P0 / v2.9.3** |
| 12 | 文本项目 | ❌ | **P3 / v2.9.10** |
| 13 | 文件项目命令行工具 | ❌ | **P3 / v2.9.10** |
| 14 | 双击 Ctrl / Alt 唤出 | ❌ | ⛔ **本次不做**（需原生钩子，见 §7 R1） |
| 15 | 鼠标侧键唤出 | ❌ | ⛔ **本次不做**（需原生钩子，见 §7 R1） |
| 16 | 双击鼠标左键唤出 | ❌ | ⛔ **本次不做**（需原生钩子，见 §7 R1） |
| 17 | 暂停 / 恢复快捷键 | 🟡 主进程已有 `setShortcutSuspended`，缺用户入口与状态持久化 | **P1 / v2.9.4** |
| 18 | 自定义字体 | ❌ | **P2 / v2.9.5** |
| 19 | 优先使用相对路径 | ❌ | **P0 / v2.9.3**（与免费版 #6 同一项） |
| 20 | 指定浏览器打开网址 | ❌ | **P2 / v2.9.5**（依赖网址项目先落地） |
| 21 | 环境变量（`%VAR%` 引用） | ❌ | **P0 / v2.9.3** |
| 22 | 自定义快速搜索占位符 | ❌ | **P2 / v2.9.5**（极低成本） |
| 23 | 自定义托盘图标 | ❌ | **P2 / v2.9.5** |
| 24 | 自动备份（可配路径） | 🟡 已有每日自动快照，但路径固定在 `<data>/backups`，份数不可配 | **P2 / v2.9.5** |
| — | **（本项目自身缺陷）默认热键 `Alt+Space` 开箱即死** | ❌ | **P0 / v2.9.3**（本次新增，见 §5.6） |

### 2.3 tidy-desktop 已有、Dawn 没有的能力（**不要为了对标而砍掉**）

- 整理中心：失效路径清理、图标批量补全、空分类清理、自动分类规则、隐藏项恢复、快捷方式导入
- 使用统计：常用 / 长期未用项目洞察
- 文件发送：文档一键复制到剪贴板、图片拖拽到外部应用
- 智能启动 chips（按启动次数/最近使用）
- 多选批量操作 + 一键撤销
- 数据可靠性基建：`jsonTransaction`（原子写 + 崩溃恢复）、每日备份、`.corrupt-<ts>` 隔离
- 自动更新（Gitee 主源 + GitHub 兜底 + SHA256 校验）

---

## 3. 功能清单（按优先级）

### P0 · v2.9.3「启动器基本盘」

目标：让 tidy-desktop 从"能装程序"变成"什么入口都能装、还能自动跟着文件夹走"，同时修掉开箱即死的全局热键。

| ID | 功能 | 验收标准 |
|---|---|---|
| P0-1 | **网址项目** | 可添加 URL；添加时自动抓取页面标题与 favicon（失败则降级为字母图标 + 域名）；卡片点击默认浏览器打开；右键菜单提供"复制链接""用其它浏览器打开" |
| P0-2 | **组合启动（多项目运行）** | 可把多个已有项目打包成一个"组合"；点击组合按序/并发启动全部成员；组合卡片显示成员数徽章；支持"启动前确认"开关 |
| P0-3 | **收纳格** | 项目区内可新建收纳格，把项目拖进/拖出；收纳格可折叠、可命名、可换图标；不改变项目本身的分类归属 |
| P0-4 | **相对路径 + 环境变量** | 新建项目时若目标位于"应用数据目录 / 自定义根目录"之下，优先存相对路径；路径字段支持 `%VAR%` 引用；设置页可维护变量表；解析失败时明确提示而非静默打不开 |
| P0-5 | **关联文件夹** | 分类可绑定本地目录；目录内容变化后同步（含子目录、可排序、可隐藏单项）；同步条目与手工条目视觉可区分；同步失败/目录丢失有明确状态 |
| P0-6 | **Appx / 开始菜单扫描补强** | 扫描结果包含 Microsoft Store 应用（AUMID 启动）；导入列表可按来源筛选、去重、批量勾选 |
| **P0-7** | **默认热键修复与迁移**（本次新增） | 默认主窗口热键改为 `Ctrl+Alt+Space`；注册失败时按降级链自动重试并明确告知生效组合；老用户（`hotkey === 'Alt+Space'`）一次性迁移；默认值收敛到 `shared/` 单点导出。方案见 **§5.6** |

**为什么这批是 P0**：P0-1…P0-6 是"启动器"的定义域，且互相有依赖（P0-4 的路径解析器是 P0-5 的前提；P0-2 需要 P0-1 的网址类型才能真正好用）。**P0-7 是纯缺陷修复**——它与其他项零耦合、风险最低，且是"用户第一次装上就按不出窗口"这个最严重体验问题的唯一解，因此放在最前面做。

**发版口径**：按你指定的 patch 序列，本阶段发 **v2.9.3**。注意这与 README 里"patch 修 bug、minor 新功能"的既有约定有出入——本次把这批定位为"增量补齐"而非"大版本"，属有意为之。

### P1 · v2.9.4「唤醒与搜索」

| ID | 功能 | 验收标准 |
|---|---|---|
| P1-1 | **本机文件搜索** | 搜索窗可搜本机文件/文件夹；通过 HTTP 接口连接本机已有的 Everything（自动检测端口），**不自建索引** |
| P1-2 | **搜索结果定位回主界面** | 搜索结果项提供"在主界面中显示"动作：打开主窗口、切到所属分类、滚动并高亮该卡片 |
| P1-3 | **暂停 / 恢复快捷键** | 设置页可录制一个暂停热键；暂停后所有唤出热键失效（仅暂停键可用），状态在托盘图标上有可见反馈，且跨重启保持 |
| P1-4 | **分类图片图标** | 分类图标支持本地图片（复制进 `icons/` 缓存）、网络图片 URL、Emoji、内联 SVG |

> **本阶段原第 5 项「唤醒手势」已按决策删除**，功能数由 5 项变为 4 项。原因见 §7 R1。

### P2 · v2.9.5「外观与个性化」

| ID | 功能 | 验收标准 |
|---|---|---|
| P2-1 | **自定义背景** | 支持纯色/渐变/图片（本地文件）；提供模糊度与暗化度滑块；**必须保证 5 套主题下的文字对比度仍过 WCAG AA** |
| P2-2 | **全局字体与缩放** | 可选系统字体列表 + 全局字号缩放；不影响图标与网格尺寸计算 |
| P2-3 | **分类字号与条目高度** | 分类条的名称字号/字重、条目高度可调；子分类条同步 |
| P2-4 | **自定义托盘图标** | 可指定图片作为托盘图标；多尺寸生成与回退策略（沿用现有 `.ico` 版本号方案） |
| P2-5 | ~~**直角模式**~~ | ⛔ **不做**（用户决策 2026-09-29）：界面全部保留圆角，不提供"圆角归零"开关。`UISettings.squareCorners` 字段一并从类型与校验里删除，不留死配置 |
| P2-6 | **指定浏览器打开网址** | 设置页维护浏览器列表（名称 + 可执行路径），网址项目可指定 |
| P2-7 | **自动备份可配** | 备份目录可自定义、保留份数可配、可关闭；与现有每日快照逻辑合并而非并存两套 |
| P2-8 | **自定义搜索占位符** | 搜索框占位文字可改 |

### P3 · v2.9.10「进阶与安全」

| ID | 功能 | 备注 |
|---|---|---|
| P3-1 | 文本项目（笔记/待办） | ✅ 已落地。打开后可查看全文、复制、继续编辑 |
| P3-2 | 文件项目命令行工具 | ✅ 已落地。执行命令 + 路径前参数 + 路径 + 路径后内容 |
| P3-3 | 分类密码 | ❌ **已评估不做**（2026-09-30）。数据是明文 JSON，搜索窗全量搜 `apps`，锁住的分类照样搜得到、回车即开；出口太多，收益 < 维护成本 |
| P3-4 | 分类独立窗口 | ❌ **已评估不做**（2026-09-30）。收益被收纳格 / 全局热键 / 结果定位覆盖，成本是持续的双窗口维护 |
| P3-5 | 配置预设导入导出 | ✅ 已落地。仅含 `ui` / `autoCategoryRules` / `quickActions` / `searchEngines` / `envVars` / `browsers`，导入必须过 `sanitizeConfig` |
| P3-6 | 搜索命令行工具 | ❌ **已评估不做**（2026-09-30）。扩成任意 cmd / PowerShell 命令 = 把任意命令执行挂到全局热键上，与红线 11 冲突 |
| P3-7 | 默认搜索热键缺陷修复 | ✅ 已落地（2026-09-30，本轮新增）。`Ctrl+K` → `Ctrl+Alt+K` + 独立迁移标记 |
| R7 | 便携版打包目标 | ✅ 已落地（2026-09-30，原待拍板项）。`portable` target + 数据目录切 `PORTABLE_EXECUTABLE_DIR` + 更新器屏蔽 |

### ⛔ 本次不做

- **鼠标手势 / 全局鼠标键盘钩子唤出**（双击 Ctrl、双击 Alt、鼠标侧键、双击左键）——本次决策暂不实现，理由与将来重启条件见 §7 R1。
- **P3-3 分类密码**（2026-09-30 评估）：只能是"防误触"，且搜索窗全量搜 `apps`（锁住的分类照样搜得到、回车即开），另有总览 / 使用情况 / 智能整理 / 组合成员 / 「移动到分类」等出口；防误触已有 `confirmBeforeLaunch`。做它会给用户错误的安全预期。
- **P3-4 分类独立窗口**（2026-09-30 评估）：收益被「收纳格 + 全局热键 + 搜索结果定位回主界面」覆盖；成本是持续的双窗口维护（主题 / 背景 CSS 变量写在 `documentElement`，每个窗口都得各应用一次）。
- **P3-6 `>` 扩到 cmd / PowerShell**（2026-09-30 评估）：现状是**封闭集合**（`BUILT_IN_COMMANDS` + `quickActions` → `runUiCommand`），扩成任意命令等于把任意命令执行挂到一个**全局热键**上，与红线 11 冲突；边际收益只有"少按一次 Win+R"。
- **插件系统 / 脚本市场**：与"零外部依赖、数据可控"的定位冲突，维护成本极高。
- **云同步 / 账号体系**：涉及隐私与后端成本，且本地 JSON 模型不适合直接云化。
- **自建文件索引**：不做。本机文件搜索**只连用户已有的 Everything**，不自己扫盘建索引——维护两套检索源只会互相打架，且 Everything 覆盖全盘、更快、更省内存。（早期版本曾做过内置索引兜底，已整套移除。）
- **Dawn 式的深度外观定制（分类独立窗口吸附、界面样式多套切换）**：与现有 3 布局体系重复，收益窄。

---

## 4. 设计要点

### 4.1 数据模型扩展（`src/shared/types.ts`）

```ts
// AppItem：扩展而非新建类型，保持现有持久化格式兼容
export type AppItemType = 'app' | 'folder' | 'steam' | 'url' | 'note' | 'group'

export interface AppItem {
  // ...现有字段不变
  type?: AppItemType
  args?: string              // 启动参数
  workingDir?: string        // 起始位置
  browserId?: string         // url 类型：指定浏览器
  noteContent?: string       // note 类型
  memberIds?: string[]       // group 类型：成员项目 id
  confirmBeforeLaunch?: boolean // group：启动前确认
  sourceFolder?: string      // 关联文件夹同步产生的条目，记录来源
  isSynced?: boolean         // 是否由同步产生（只读，UI 区分）
  hiddenInFolder?: boolean   // 在关联文件夹中隐藏但保留
}
```

```ts
// Category：新增外观与同步配置
export interface Category {
  // ...现有字段不变
  fontSize?: number
  itemHeight?: number
  iconSize?: number
  linkFolder?: { path: string; includeSubdirs: boolean; lastSyncAt: number } | null
  passwordHash?: string      // P3，明确非加密用途
}
```

```ts
// Config：新增外观 / 唤醒 / 变量
export interface Config {
  // ...现有字段不变
  envVars?: { key: string; value: string }[]
  portableRoot?: string | null       // 相对路径的基准目录
  preferRelativePath?: boolean
  launchPaused?: boolean             // 快捷键暂停状态（持久化）
  hotkeyDefaultMigrated?: boolean    // 本次新增：默认热键一次性迁移标记（见 §5.6）
  browsers?: { id: string; name: string; path: string }[]
  ui?: UISettings & {
    fontFamily?: string
    uiScale?: number
    background?: { kind: 'none' | 'color' | 'image'; value?: string; blur?: number; dim?: number } | null
    trayIcon?: string | null
    searchPlaceholder?: string
    // 注：原 wakeGestures（唤醒手势）与 squareCorners（直角模式）字段已按决策删除，不再引入
  }
}
```

**新增持久化文件**：收纳格（`collections.json`）与组合成员建议**直接放进 `apps.json`**（组合是 `AppItem` 的一种 type），收纳格则作为 `categories.json` 的扩展字段或独立 `collections.json`。倾向后者——收纳格是"项目区内的容器"，与分类是并列的层级概念，混在一起会让 `groupedApps` 的既有逻辑（拖拽最敏感的部分）变得难以推理。

### 4.2 界面设计

#### 添加项目入口（`AddAppModal`）

类型选择从 3 项扩展到 6 项，用**图标 + 文字的分段控件**而非现在的 radio 行（6 个 radio 横排会挤）：

```
[ 🖥 应用 ] [ 📁 文件夹 ] [ 🌐 网址 ] [ 🎮 Steam ] [ 📝 文本 ] [ 🗂 组合 ]
```

- 选中后表单字段随类型切换（网址 → 链接 + 自动抓取按钮；组合 → 成员多选列表；文本 → 多行输入）。
- 沿用现有 `placeholders` 的按类型映射模式，不新造一套。

#### 网址项目卡片

- 图标位显示 favicon（`icons/` 缓存）；抓取失败显示**域名首字母 + 品牌色底**，不用默认图标（避免一排灰图标）。
- 标题取 `<title>`，过长截断；悬停 `title` 显示完整 URL。
- 右键菜单在"打开"下方加：`复制链接`、`用其它浏览器打开 ▸`。

#### 组合启动卡片

- 卡片右下角一个**成员数徽章**（`+3`），视觉与现有计数徽章一致（`rounded-full` + 玻璃描边）。
- 点击行为可配：默认"直接全部启动"，可选"先弹确认面板"。
- 确认面板列出成员、允许临时取消勾选某几个再启动（复用现有 `SelectionBar` 的勾选视觉）。

#### 收纳格

- 在项目区内渲染为**虚线边框容器**（`border-dashed`），标题行 = 图标 + 名称 + 折叠箭头 + 成员计数。
- 折叠状态持久化在收纳格自身数据里，不进 `Config`。
- 卡片在收纳格内用**更紧凑的网格**（继承 `gridColumns` 但间距减半）。
- ⚠️ **拖拽是高风险区**：收纳格会成为新的放置目标，必须同时接入 HTML5 与右键两套拖拽引擎，且必须给它加 `data-dragover` 并检查其 `:hover` 权重（详见 §5.3）。

#### 关联文件夹

- 分类条目右上角一个**链接角标**（Phosphor `LinkSimple`），提示该分类绑定了目录。
- 同步产生的条目在卡片上有一个**低饱和度标记**（如左上角小圆点），并在右键菜单中隐藏"编辑"、只保留"在文件夹中隐藏"。
- 目录丢失 / 无权限时，分类顶部显示一条**琥珀色横幅**（复用现有 `bg-amber-50 / text-amber-700` 语义色），提供"重新选择目录"与"解除关联"。
- 同步不自动落盘到 `apps.json`——见 §5.2 的技术方案。

#### 搜索窗口

- 结果按来源分组，加**分组标题**：`应用` / `文件` / `命令` / `搜索 "xxx"`。
- 每个结果项右侧显示来源标签；文件类结果显示完整路径（次要色）。
- 新增结果动作"在主界面中显示"（P1-2），用 `↵` 之外的快捷键提示，避免与"打开"冲突。

#### 设置页（`SettingsModal`）

现有 5 个分区（常规 / 快捷键 / 搜索 / 外观 / 关于）扩展为 7 个，新增：

- **外观**（扩充）：背景（类型 / 图片选择 / 模糊 / 暗化）、字体（字体族 / 缩放）、圆角开关、托盘图标、搜索占位符
- **项目**（新增）：优先相对路径、便携根目录、环境变量表、浏览器列表
- **唤醒**（新增，或并入快捷键）：暂停快捷键、**默认热键显示为实际生效的组合**（见 §5.6）
- ⛔ **「唤醒手势」分组不做**（原设计中的"双击 Ctrl / 鼠标侧键 / 双击左键"开关整体移除，不留置灰占位）

#### 全局视觉约束（**必须遵守**）

- 新增任何 `bg-white/NN` 透明度类，必须同时加进 `.theme-dark` 与 `.theme-system` 的两处黑名单，**并补 hover 变体**（`.theme-dark .hover\:bg-white:hover`）。
- 新增主题变量必须在 `:root` / `.theme-dark` / `.theme-system` / `.theme-glass` **四处**定义。
- 深色主题新增语义色文字类（brand / slate / red / emerald / amber 系列）要在 `.theme-dark` 与 `.theme-system`（media 块内）两处都加覆盖。
- 实心按钮白字必须过 WCAG AA 4.5:1：用 `bg-red-600`（4.83）、`bg-emerald-700`（5.48）、`bg-brand-600`（6.29），不要用 `bg-red-500` / `bg-emerald-500` / `bg-emerald-600`。
- 分隔线用 `bg-slate-300/70`，**不要用 `bg-brand-100`**（深色主题下会隐形）。
- 新增浮层若同时带 `.glass` 与 `fixed/absolute`，务必确认 `.glass.fixed` / `.glass.absolute` 规则存在（否则会退回文档流被裁）。
- 背景图功能必须给所有玻璃面板提供一个可调的**遮罩层变量**，否则背景一亮，白玻璃面板上的浅色文字全部失效。

---

## 5. 技术方案

### 5.1 主进程新增能力

| 能力 | 落点 | 要点 |
|---|---|---|
| URL 元信息抓取 | `handlers/iconHandlers.ts` 或新 `handlers/urlMetaHandlers.ts` | 复用 `update/network.ts` 的 fetch 封装思路；必须走 `urlPolicy.ts` 白名单校验；超时 5s、响应体上限（如 512KB）、只解析 `<title>` 与 `<link rel="icon">`；失败返回结构化错误，渲染层降级为字母图标 |
| favicon 缓存 | `icons/` 目录 | 命名规则沿用现有图标缓存（文件名带版本/哈希以绕开缓存） |
| 组合启动 | `handlers/appHandlers.ts` | 逐个调用现有 `open-app` 逻辑；并发 vs 串行做成参数；单个成员失败要收集错误并汇总上报，不能中断整批 |
| 关联文件夹同步 | 新 `main/folderSync.ts` + `handlers/` | 扫描用 `fs.readdirSync`（递归深度限制）；**不用 `fs.watch` 做唯一数据源**（Windows 上不可靠、网络盘不支持），用「定时轮询 + 窗口获得焦点时同步 + 手动刷新」三段式；同步结果**只驻留内存 + 一个 `folderCache.json` 缓存**，不写进 `apps.json` |
| Appx 扫描 | `handlers/systemHandlers.ts` | 用 `Get-StartApps`（PowerShell）拿 AUMID + 名称；**不要 `execFileSync`**（会阻塞主进程），用异步 `execFile`；结果缓存，失败静默降级为只扫 `.lnk` |
| 环境变量解析 | `shared/pathResolve.ts`（新） | 纯函数：`resolvePath(input, { envVars, portableRoot })`；主进程与渲染层共用；必须可单测 |
| 默认热键与降级链 | `main/index.ts` 的 `bindGlobalShortcuts` + 新 `shared/defaults.ts` | 见 **§5.6** |
| ~~唤醒手势~~ | — | ⛔ **本次不实现**（见 §7 R1），主进程不引入任何原生模块 |
| Everything 检测 | `main/` | 探测 `es.exe` 路径或 HTTP 端口（可配）；检测失败一律走内置降级，**绝不让 Everything 成为硬依赖** |

### 5.2 数据与持久化

- **一律走现有基建**：`jsonTransaction`（tmp + rename + 崩溃恢复）、`validation.ts`（`sanitizeConfig` 等入参校验）、`backup.ts`（每日快照）。
- **新增字段全部可选**，老数据（无新字段）必须能直接读；新数据被老版本读到会丢字段，这是已知取舍（可在写入时保留未知字段以减轻，但不必强行做）。
- **关联文件夹的同步条目不进 `apps.json`**：理由——目录内容可能成百上千条，写进主数据文件会让每次落盘体积暴涨，且目录变动会频繁触发写入（与"高频路径不落盘"的既有原则一致）。做法：`folderCache.json` 存快照，渲染层把「手工项目 + 同步项目」合并成展示用的 `apps` 数组。
- ⚠️ **`useAppCrud` 仍是应用数据变更的唯一入口**。同步项目是只读的，任何"把同步项改成手工项"的操作都要显式转换后再走 `commitApps`，不允许绕开。
- ⚠️ 新增的 `commitApps` 调用点必须先确认 `appsRef` 与 `state` 同步写入，不能手写 `appsRef.current = x; setApps(x); persistApps(x)` 三连。

### 5.3 渲染层

- 新增业务逻辑**一律进 hooks**，`App.tsx` 只做接线。建议新增：
  - `useUrlMeta`（抓取标题/图标）
  - `useLaunchGroups`（组合启动）
  - `useCollections`（收纳格）
  - `useFolderSync`（关联文件夹同步状态）
  - `useEnvVars`（变量表读写 + 路径预览）
- **拖拽**：收纳格是新的放置目标，必须
  1. HTML5 与右键拖拽**两套都接**；
  2. 加 `data-dragover` 属性，并检查其 `:hover` 规则的权重（否则高亮永不显示——项目已踩过 3 次）；
  3. 落点判定走 `utils/dropTarget.ts` 的既有纯函数，并遵守「**落点 ref 先读后清**」；
  4. 拖拽期间**绝不把源卡片移出 DOM**。
- **新增 IPC**：每加一个 `invoke` 通道，必须在 `src/main/preload.ts` 与 `src/shared/electron.d.ts` **两处**登记；主→渲染事件还要处理 `webContents.isLoading()` 的 `did-finish-load` 兜底。
- **按键判定**：任何新的键盘交互都要走 `utils/keyboard.ts` 的 `resolveMainKeyAction()`，注意「Esc 必须在 `isEditableTarget` 之前」这条顺序不能动。`utils/keyboard.ts` 顶部注释里写的"Alt+Space / Ctrl+K"要同步改成新默认值。

### 5.4 CSS / 主题

- 新 UI 优先使用**语义化 CSS 类 + 主题变量**，不要硬编码 `from-orange-50` 之类的渐变起点（深色下会把图标容器糊掉）。
- 背景图功能引入 `--app-bg-image` / `--app-bg-blur` / `--app-bg-dim` / `--panel-overlay` 四个变量，四处主题都定义。
- 新增动画必须把隐藏态写在 `@keyframes` 的 `from`，并登记进 reduced-motion 禁用清单。
- ⛔ **不做直角模式**（2026-09-29 决策）：界面全部保留圆角。

### 5.5 测试

- 纯函数必须有测试：`resolvePath`（环境变量 / 相对路径）、文件夹同步的 diff 算法、URL 元信息解析、组合启动的成员顺序、**热键降级链的选择逻辑**。
- 现有测试风格参考 `utils/*.test.ts`（Vitest，jsdom 环境）。
- 样式类改动建议用现有视觉审计工装（`audit.html` + `__audit__` + CDP 脚本）跑一遍 hover/focus 对比度矩阵。
- ⚠️ `src/main/validation.test.ts`、`src/main/jsonTransaction.recovery.test.ts`、`src/renderer/src/__audit__/fixtures.ts` 里都硬编码了 `'Alt+Space'`，改默认值时要一并评估（fixture 里的写法本身可以保留，只要它是在测"自定义值"而非"默认值"）。

### 5.6 默认热键更换（本次修订新增）

#### 5.6.1 现状诊断

`Alt+Space` 是 **Windows 保留组合**（系统窗口菜单），`globalShortcut.register('Alt+Space')` 拿不到它，返回 `false`。项目目前已经做了两层处理：

- `src/main/index.ts` 的 `createWindow` 里挂了 `hookWindowMessage(WM_SYSCOMMAND / SC_KEYMENU)`，吞掉无边框窗口的系统菜单；
- 同一个钩子在识别到 `lParam === VK_SPACE` 时调用 `fallbackAltSpaceHotkey()`，**在主窗口有焦点时**本地切换显隐。

**但兜底覆盖不到主场景**：钩子依赖窗口消息，窗口隐藏 / 未聚焦时根本收不到，所以"从任意位置唤起启动器"这个核心用途依然是死的。用户看到的现象就是"装了之后按 Alt+Space 没反应"。

#### 5.6.2 新的默认热键

> **默认主窗口热键：`Ctrl+Alt+Space`**；**默认搜索热键：`Ctrl+Alt+K`**（2026-09-30 拍板，原 `Ctrl+K` 见 §5.6.7）

选它的理由：

| 候选 | 结论 |
|---|---|
| `Alt+Space` | ❌ Windows 保留，`register` 拿不到（当前问题） |
| `Alt+Q` | ❌ 被 Office「Tell me / 搜索」占用，全局抢占会让用户在 Office 里按不出该功能 |
| `Ctrl+Shift+Space` | ❌ 被 Visual Studio「参数信息」等占用 |
| `Ctrl+Alt+Space` | ✅ **不在 Windows 保留列表**，主流应用极少占用，且保留 Space 的肌肉记忆（老用户改键成本最低），与 `Ctrl+K`、与 P1 的暂停热键都不冲突 |

#### 5.6.3 三级降级链（根治"开箱即死"）

`bindGlobalShortcuts` 改为**按顺序尝试候选组合，取第一个注册成功的**：

```
Ctrl+Alt+Space  →  Ctrl+Alt+Q  →  Ctrl+Shift+Space
```

- 无论最终落在哪一个，都通过**既有的 `hotkey-issue` 通道**明确告知用户"实际生效的是哪个组合"（该通道已支持自增 id 去重与 `did-finish-load` 兜底，直接复用，不新造机制）。
- 设置页的快捷键录制框**显示实际生效值**，而不是配置里写的期望值——避免"设置里写着 A、实际是 B"的二次困惑。
- 三个候选全部失败时，走现有的失败上报路径，并在设置页给出明确指引（"被其它软件占用，请手动指定"）。
- **不允许再出现"注册失败且用户不知道"的静默状态。**

#### 5.6.4 老用户一次性迁移

- 判定规则：`config.hotkey === 'Alt+Space'` 视为**从未自定义过**（因为它就是旧默认值），一次性改写为 `Ctrl+Alt+Space`，并弹一次说明性提示。
- 用户手动改成的**其它**组合一律不动（只匹配旧默认值这一个字面量）。
- 用 `hotkeyDefaultMigrated: true` 标记避免重复执行；迁移在配置读取之后、`bindGlobalShortcuts` 之前完成。
- 旧值 `Alt+Space` 仍可被用户**手动**选回（兼容路径保留，见 5.6.5）。

#### 5.6.5 `Alt+Space` 兜底路径的去留

- **`WM_SYSCOMMAND / SC_KEYMENU` 钩子必须保留**：它同时负责吞掉无边框窗口的系统菜单，删掉会让 Alt+Space 弹出无意义的系统菜单。
- `fallbackAltSpaceHotkey()` 的定位从"默认热键的兜底"**降级为"仅服务手动把热键设为 Alt+Space 的用户"**的兼容路径，逻辑本身不用改（它已经在判断 `config.hotkey === 'alt+space'`）。
- `activeGlobalShortcuts` 用于判断"是否已被 globalShortcut 接管"的逻辑保持不变。

#### 5.6.6 默认值散落在四处（改默认值必须同步）

这是本次修订顺带发现的**结构性问题**——同一个默认值硬编码在 4 个地方，改一处漏三处就会造成"主进程注册的是 A、设置页显示的是 B"：

| 位置 | 内容 |
|---|---|
| `src/main/config.ts:186` | `getDefaultConfig()` 的 `hotkey: 'Alt+Space'` |
| `src/main/index.ts:600` | `const hotkey = config.hotkey \|\| 'Alt+Space'`（硬编码兜底字面量） |
| `src/renderer/src/components/modals/SettingsModal.tsx:80` | `const DEFAULT_HOTKEY = 'Alt+Space'` |
| `src/renderer/src/utils/keyboard.ts:5` | 注释里写死的 "Alt+Space / Ctrl+K"（文档性质） |

> **做法：顺手把默认值收敛到 `src/shared/defaults.ts` 单点导出**（`DEFAULT_HOTKEY` / `DEFAULT_SEARCH_HOTKEY` / `HOTKEY_FALLBACKS`），主进程与渲染层共用。这是消除"改一处漏三处"的根本办法，成本极低，建议纳入 P0-7。
>
> ✅ **已落地**（P0-7）。当前该文件还导出 `LEGACY_DEFAULT_HOTKEY` / `LEGACY_DEFAULT_SEARCH_HOTKEY`
> 与两套迁移计划（`planHotkeyDefaultMigration` / `planSearchHotkeyDefaultMigration`），
> 由 `shared/defaults.test.ts` 的常量护栏锁定（不能是旧默认值 / 一律 ≥2 个修饰键 / 不与降级候选撞车）。

#### 5.6.7 搜索窗热键（2026-09-30 已拍板：改）

**搜索窗 `Ctrl+K` 有同一类问题**：`globalShortcut.register` 成功即**系统级独占**，
装上之后浏览器（Chrome / Edge）的"聚焦地址栏"、VS Code 的"删行"、Word、Slack、Gmail
等**所有软件**的 `Ctrl+K` 都会被本应用吞掉，且不报错——用户只会觉得"某些软件突然不好用了"。

**决策：默认值改为 `Ctrl+Alt+K`**（与主热键的 `Ctrl+Alt+*` 家族一致），
配独立的 `searchHotkeyDefaultMigrated` 迁移标记。见「P3-7 默认搜索热键缺陷修复」实现说明。

---

## 6. 分阶段开发步骤

每个阶段内部按「数据模型 → 主进程 → 渲染层 → 样式 → 测试」推进，**每阶段结束跑 `npm run typecheck` + `npm test`**。

### 阶段 P0 · v2.9.3 启动器基本盘

| 步骤 | 内容 | 涉及文件 |
|---|---|---|
| **1** | **默认热键更换 + 降级链 + 老用户迁移 + 默认值收敛到 `shared/defaults.ts`**（零耦合、风险最低，先落地先收益） | `shared/defaults.ts`（新）、`main/config.ts`、`main/index.ts`、`modals/SettingsModal.tsx`、`utils/keyboard.ts`（注释） |
| 2 | 扩展类型：`AppItemType`、`AppItem` 新字段、`Category.linkFolder`、`Config.envVars / portableRoot / preferRelativePath / hotkeyDefaultMigrated` | `shared/types.ts` |
| 3 | 新增路径解析纯函数 + 测试 | `shared/pathResolve.ts`（新）、`.test.ts` |
| 4 | 主进程：`Get-StartApps` Appx 扫描（异步 `execFile` + 缓存 + 降级） | `handlers/systemHandlers.ts` |
| 5 | 主进程：URL 元信息抓取（白名单 + 超时 + 体积上限 + favicon 缓存） | `handlers/urlMetaHandlers.ts`（新）、`iconHandlers.ts` |
| 6 | 主进程：组合启动（复用 open-app，失败汇总） | `handlers/appHandlers.ts` |
| 7 | 主进程：`folderSync.ts`（扫描 + diff + 缓存文件 + 三段式触发） | `main/folderSync.ts`（新） |
| 8 | IPC 登记（invoke + 事件） | `main/preload.ts`、`shared/electron.d.ts` |
| 9 | 渲染层：`AddAppModal` 6 类型分段控件 + 按类型表单 | `modals/AddAppModal.tsx` |
| 10 | 渲染层：网址卡片渲染（favicon / 降级 / 右键菜单扩展） | `AppCard.tsx`、`AppContextMenuOverlay.tsx` |
| 11 | 渲染层：组合卡片 + 确认面板 | `AppCard.tsx`、新 `LaunchGroupPanel.tsx` |
| 12 | 渲染层：收纳格（渲染 + 折叠 + 两套拖拽接入） | `AppGrid.tsx`、`useDragAndDrop.ts`、`utils/dropTarget.ts` |
| 13 | 渲染层：关联文件夹状态 UI（角标 / 横幅 / 同步按钮） | `CategoryNav.tsx`、新 `useFolderSync.ts` |
| 14 | 样式：收纳格、角标、横幅、徽章（四处主题变量 + 黑名单补全） | `index.css` |
| 15 | 测试 + 视觉审计（拖拽与 hover 高亮重点回归） | `*.test.ts`、`.audit/` |
| 16 | 文档：README 功能清单与快捷键表、CHANGELOG、设置说明 | `README.md`、`CHANGELOG.md` |

**发版口径**：**v2.9.3**（patch）。步骤 1 与其余步骤无依赖，可独立先发一个更小的修复版；若想这么做，步骤 1 单独发 **v2.9.3**、其余合并为 **v2.9.4**，后续阶段顺延一号。

### 阶段 P1 · v2.9.4 唤醒与搜索

1. `launchPaused` 状态模型 + 托盘可见反馈 + 设置页录制入口（复用 `set-shortcut-suspended` 通道）
2. 搜索结果"定位回主界面"：新增 `ui-command` 变体（带 payload 的 `locate-app`），主窗口接收后切分类 + 滚动 + 高亮
3. Everything 自动检测（ini 位置可能不止 `%APPDATA%`，按 mtime 合并 + 候选端口探测兜底），搜索只走 Everything 通道
4. 分类图片图标：本地图片导入（复制进 `icons/`）、网络图片、SVG 内联
5. 搜索窗口分组标题 + 结果来源标签

> ~~原步骤 5「唤醒手势：先实现不需要原生钩子的部分；原生钩子项单独立项做技术验证」**已删除**（本次决策）。~~

### 阶段 P2 · v2.9.5 外观与个性化

1. 背景变量体系 + 遮罩层 + 5 主题对比度校验
2. 全局字体与缩放（注意不影响网格尺寸计算）
3. 分类字号 / 条目高度
4. 托盘图标自定义（多尺寸 + 回退）
5. ⛔ ~~直角模式~~ 不做（全部保留圆角）
6. 浏览器列表 + 网址项目指定浏览器
7. 自动备份可配（与现有 `backup.ts` 合并，不并存两套）
8. 搜索占位符

### 阶段 P3 · v2.9.10 进阶与安全

1. ✅ 文本项目（笔记 / 待办均已落地）——见「实施进度（P3）」
2. ✅ 文件项目命令行工具——已落地为「用指定程序打开」（命令模板 + 路径前/后参数），见「实施进度（P3）」
3. 分类密码（**必须明确"防误触非加密"**，UI 上要有说明）
4. 分类独立窗口（不含吸附）
5. ✅ 配置预设导入导出（必须过 `sanitizeConfig`）——已落地，见「实施进度（P3）」
6. `>` 命令模式扩展到 cmd / PowerShell

---

## 7. 潜在风险与依赖项

### 风险

| ID | 风险 | 等级 | 说明与缓解 |
|---|---|---|---|
| **R1** | ~~全局鼠标 / 键盘钩子（双击 Ctrl、鼠标侧键、双击左键唤出）~~ | ⛔ **已决策暂缓** | 需引入 `uiohook-napi` 等**原生模块**，会打破"纯 JS 依赖、打包简单"的现状（electron-builder 需 rebuild、可能被杀软误报、与现有全局热键冲突）。**本次不实现，打包链路维持现状。** 重启条件：将来若真要做，必须先单独完成技术验证（Electron 43 + Node 24 下能否编译并稳定运行），验证通过再排期；否则一律用"全局热键组合"替代。 |
| **R2** | 数据模型膨胀导致迁移事故 | 🔴 高 | 新增 3 类项目 + 7 个 Category/Config 字段。缓解：所有新字段可选、`sanitizeConfig` 覆盖、写入前自动备份、发版前用老数据文件回归读取。 |
| **R3** | 收纳格拖拽破坏现有拖拽引擎 | 🔴 高 | 拖拽是历史上 bug 最密集的区域（落点顺序、DOM 移除、hover 权重、性能守卫）。缓解：收纳格作为独立放置目标接入，复用 `dropTarget.ts` 纯函数 + 补测试；**不要在拖拽期间把源卡片移出 DOM**；新增放置目标先查 `:hover` 权重。 |
| **R4** | 关联文件夹同步的性能与可靠性 | 🟠 中高 | `fs.watch` 在 Windows / 网络盘不可靠；大目录扫描会卡主进程。缓解：定时轮询 + 焦点触发 + 手动刷新；扫描放主进程异步、限制递归深度与条目上限；同步条目**不写 `apps.json`**。 |
| **R5** | 外部网络请求（URL 标题/favicon 抓取） | 🟠 中 | 隐私（暴露访问的网址）、超时、恶意 HTML、超大响应。缓解：`urlPolicy` 白名单、5s 超时、512KB 上限、只解析 title/icon、失败降级、提供"不抓取"开关。 |
| **R6** | 背景图与主题对比度冲突 | 🟠 中 | 项目对 WCAG 有明确要求（历史多次修复浅字压浅底）。背景图会打乱所有玻璃面板的对比度。缓解：强制遮罩层（模糊 + 暗化）、给每个主题预设最小遮罩值、用视觉审计工装跑对比度矩阵。 |
| **R7** | 相对路径 / 便携模式的价值受限于"没有便携版" | 🟡 中 → ✅ **已决策解决** | 已新增 `portable` 打包目标（`electron-builder.yml`），并把数据目录切到 `PORTABLE_EXECUTABLE_DIR`、更新器对便携版只给「打开发布页」、发布物挑选优先 `-Setup-`。见「R7 便携版」实现说明。 |
| **R8** | Everything 成为隐性硬依赖 | 🟡 中 | 文件搜索**只走 Everything**（已决策不自建索引），故未装 Everything 时该功能不可用。缓解：设置页明确标注需安装并开启 HTTP 服务 + 给出指引；文件搜索只是搜索窗的附加能力，不影响应用/命令搜索。 |
| **R9** | Appx 扫描依赖 PowerShell | 🟡 中 | `Get-StartApps` 需 PowerShell；`execFileSync` 会阻塞主进程。缓解：异步 `execFile` + 超时 + 缓存 + 失败静默降级为只扫 `.lnk`。 |
| **R10** | 分类密码给出错误的安全预期 | 🟡 中 | 数据文件是明文 JSON，密码只能挡界面入口。缓解：UI 文案明确"仅防止误触与窥屏，不加密数据"；不做"忘记密码"找回（避免假安全感）。 |
| **R11** | 打包与发布只能在普通终端执行 | 🟡 中 | WorkBuddy 环境无法打包（safe-delete shim 拦截 `fs.rmSync`）。**本次不引入原生模块**，打包配置无需改动，此风险维持原状。 |
| **R12** | 默认热键 `Alt+Space` 开箱即死 | 🟠 中高 → ✅ **已决策解决** | 现状：`globalShortcut` 拿不到（Windows 保留），现有 `WM_SYSCOMMAND` 钩子只在主窗口有焦点时兜底，窗口隐藏时无效。**方案：默认值改 `Ctrl+Alt+Space` + 三级降级链 + 老用户一次性迁移，见 §5.6，随 P0 / v2.9.3 落地。** |
| **R13** | 热键默认值散落四处，漏改造成主进程与界面显示不一致（本次修订新增） | 🟠 中 | 同一默认值硬编码在 `config.ts` / `index.ts` / `SettingsModal.tsx` / `keyboard.ts` 注释 4 处。缓解：**收敛到 `shared/defaults.ts` 单点导出**，纳入 P0-7；并加一条测试锁定默认值。 |

### 依赖项

| 类型 | 依赖 | 说明 |
|---|---|---|
| 内部基建 | `jsonTransaction` / `validation` / `backup` / `ipcGuard` / `urlPolicy` | 全部已有，新增功能必须复用而非另起一套 |
| 内部基建 | 图标缓存（`icons/`）与 AUMID 匹配 | URL favicon、托盘图标、分类图片图标都要接入 |
| 内部基建 | 两套拖拽引擎（HTML5 + 右键） | 收纳格必须双接入 |
| 内部基建 | `hotkey-issue` 上报通道 | 热键降级链复用，不新造机制 |
| 外部（可选） | Everything（`es.exe` 或 HTTP 接口） | 必须可降级，不能硬依赖 |
| ~~外部~~ | ~~`uiohook-napi` 类原生模块~~ | ⛔ **本次不引入**（R1 已决策暂缓） |
| 外部 | PowerShell（`Get-StartApps`） | 失败需降级 |
| 平台 | Windows 10/11 | 与现有一致，不扩平台 |
| 流程 | 用户在普通终端打包验证 | 见 R11 |

### 已拍板的决策点（2026-09-30）

> 原第 1 条（默认热键）与原第 2 条（是否引入原生模块）此前已决策完毕。以下 4 条为本轮拍板结果，
> 均已落地或明确不做，不再列为待定项。

1. **R7 便携版** → ✅ **做**。`electron-builder.yml` 加 `portable` target；`CONFIG_DIR` 切到
   `PORTABLE_EXECUTABLE_DIR`（**不是** `process.execPath` 的目录）；更新器屏蔽便携版自更新；
   发布物挑选优先 `-Setup-`。见「R7 便携版」实现说明。
2. **P3-3 分类密码** → ❌ **不做**。数据是明文 JSON，且搜索窗全量搜 `apps`（锁住的分类照样能搜到、
   回车即开），另有总览 / 使用情况 / 智能整理 / 组合成员 / 「移动到分类」等多个出口；
   防误触已有 `confirmBeforeLaunch`。收益小于维护成本，还会给用户错误的安全预期。
3. **§5.6.7 搜索窗热键** → ✅ **改**。`Ctrl+K` 是**缺陷**而非偏好：全局注册即系统级独占，
   会吞掉全系统所有软件的 `Ctrl+K` 且不报错。默认值改 `Ctrl+Alt+K` + 独立迁移标记。
   见「P3-7」实现说明。
4. **发版粒度** → **一次性大版本 v3.0.0**（2026-10-01 更新）。P0–P3 的代码在同一工作区
   一起写完，四个阶段从未单独发布，因此不拆版本；`package.json` 从 `2.9.2` 走
   **`npm run release -- major`** 到 **`3.0.0`**。定 major 而不是 patch 的理由：
   默认全局热键变了（`Alt+Space` → `Ctrl+Alt+Space`、`Ctrl+K` → `Ctrl+Alt+K`），
   属于会改变用户现有行为的变化，patch 号表达不了这个信号。
   CHANGELOG 里原来的 v2.9.3 / v2.9.4 / v2.9.5 / v2.9.10 四个分节已改为
   「P0–P3 阶段名 + 原计划版本号」并统一挂到 `## v3.0.0` 之下。
5. **P3-4 分类独立窗口** → ❌ **不做**。收益被「收纳格 + 全局热键 + 搜索结果定位回主界面」覆盖；
   成本是持续的双窗口维护（主题 / 背景 CSS 变量写在 `documentElement`，每个窗口各应用一次）。
6. **P3-6 `>` 扩到 cmd / PowerShell** → ❌ **不做**。现状是封闭集合
   （`BUILT_IN_COMMANDS` + `quickActions` → `runUiCommand`）；扩成任意命令等于把
   **任意命令执行挂到全局热键**上，与红线 11 冲突，边际收益只有"少按一次 Win+R"。

### 启动路径性能优化（2026-10-01）

> 目标：缩短「按全局热键 → 窗口可见可交互」的延迟，消除唤出时的卡顿与视觉跳变。
> 涉及两条链路：主窗口（`Ctrl+Alt+Space` 唤出）与搜索框（`Ctrl+Alt+K` 唤出）。

#### 实测基线（本机，`apps.json` 215 项 / 1.58MB，其中 94% 是图标 base64）

| 项 | 数值 |
| --- | --- |
| `readFileSync(apps.json)` | 8 ms |
| `JSON.parse` | 4 ms |
| `JSON.stringify` | 5 ms |
| 关联文件夹 | 1 个（不含子文件夹）；`folderCache` 另有 3 个历史条目 |

即：**单次 `get-apps` 的纯 IO 开销只有十几毫秒**，真正的代价在结构化克隆序列化 +
渲染层反序列化 + 由此触发的整轮 `setState` 重渲染。所以优化方向是**减少次数**，
而不是"把单次搞快"。

#### 五条瓶颈与对应改法

| # | 瓶颈 | 为什么是瓶颈 | 改法 |
| --- | --- | --- | --- |
| 1 | `index.css` / `search.css` 顶部的 Google Fonts `@import` | `@import` 是**渲染阻塞资源**：浏览器必须先把这个跨域样式表拉回来才绘制首帧。`fonts.googleapis.com` 在中国大陆基本不可达 → 首帧被一段注定超时的请求拖住 | 从 CSS 摘掉，改由 `renderer/src/utils/remoteFonts.ts` 在**首帧绘制完成后**（双 `rAF` → `requestIdleCallback`）动态插 `<link>`。`display=swap` 保证先回退系统字体、字体到位后自动替换 |
| 2 | `index.ts` 的 `win.on('focus') → notifyMainWindowFocused()` → `resyncAllFolders()` | `scanFolder` 用的是 `fs.statSync` / `fs.readdirSync`，整段**不可中断**；主进程事件循环被按死，渲染层此刻发的 IPC 全部排队。慢盘上可达秒级 | `scanFolder` 改 `fs.promises.*`（逐目录 `await`，**串行**——顺序是 diff 的输入，并行会让 `entries` 排列不确定），链路跟着异步；「焦点」这条触发再延后 `FOCUS_RESYNC_DELAY_MS = 1200ms` |
| 3 | `SearchApp` 的 `reset-search` → `loadData()` → `get-apps` | 每次唤出都传 1.58MB。数据其实已由 `save-apps` 的 `apps-updated` 广播保鲜 | `loadData({ skipApps })`：只在首次（`appsLoadedRef === false`）拉项目数据。配置 / 分类 / 关联文件夹缓存**没有广播**，仍每次重拉 |
| 4 | `reset-search` 在 `show()` **之后**才发 | 用户先看到上一次的结果闪一帧，紧接着窗口高度从"结果多时的高"跳到"清空后的矮" | 复位搬到 `win.on('hide')`（窗口已不可见）；唤出时补发一次作为兜底，并借 `heightSyncTick` 强制重测一次高度 |
| 5 | `app.on('ready')` 里 `runStartupBackup` 排在 `createWindow()` **之前** | 备份是同步 IO（`copyFileSync` 4 个文件 + prune），窗口出现时间被串行地加上这段 | `createWindow()` 提到备份之前，渲染进程启动与备份并行。⚠️ 备份**仍必须**在热键迁移之前（当天的快照要留一份迁移前的配置） |

#### 明确排除的非瓶颈

- `scheduleIconBackfill` —— 已经延迟 3.5s、每批 3 个、批间 80ms，不在首帧路径上。
- `useUpdate` 挂载即自动 `checkForUpdate` —— 纯网络，不阻塞首帧；它的 8–10s 失败窗口
  与 `loadData` 抢的是网络而非主线程。
- `jsx-runtime` 分包 —— `main` / `search` 已共用同一个 434KB 的共享 chunk，无需再动。
  （本轮新增的 `utils/remoteFonts.ts` 也被两个入口共同引用，rolldown 按"共享模块"重算了
  chunk 名，产物从 `jsx-runtime-*.js` 变成 `remoteFonts-*.js`——**只是名字变了**，
  体积与引用关系不变，两个 HTML 里的 `modulepreload` 同步跟着改。没有任何地方硬编码这个名字。）

#### 排查这类问题的方法论

**看代码看不出阻塞。** 本次三条瓶颈（1 / 2 / 4）都不体现在函数体的长度上，
得靠"这个调用会不会挡住首帧"这条线去问：

- 渲染阻塞资源只有两类：**首帧之前存在的 `<link rel=stylesheet>` / `@import`**，以及
  同步执行的 `<script>`。**动态插入的 `<link>` 同样会挂起渲染**——所以必须等首帧画完再插
  （双 `rAF`），否则等于把 `@import` 的阻塞原样搬过来。
- 主进程里的**同步文件 IO** 就是事件循环的暂停键。判断标准不是"快不快"，而是
  "这段跑的时候，渲染层发的 IPC 能不能被处理"。`fs.*Sync` 一律不能出现在热路径上。
- 「唤出」是一次**重新进入**，不是首次加载。凡是"每次进入都重做一遍"的初始化，
  都要问一句"这份数据在两次进入之间会变吗、变了有人通知我吗"。
  有通知（`apps-updated`）就别重拉；没通知（配置 / 分类）就重拉，但只重拉小的那份。

---

## 8. 附：与现有项目约定的对齐检查表

改动前请逐条确认（详见 `.workbuddy-ai/memory/MEMORY.md`）：

- [ ] 应用数据落盘是否只走 `useAppCrud` 的 `commitApps` / `mutateApps`？
- [ ] 新增 IPC 通道是否在 `preload.ts` **与** `shared/electron.d.ts` 两处登记？
- [ ] 主→渲染事件是否处理了 `webContents.isLoading()` 的 `did-finish-load` 兜底？
- [ ] 新增放置目标是否同时接入 HTML5 与右键拖拽，并加了 `data-dragover`（且检查了 `:hover` 权重）？
- [ ] 落点 ref 是否「先读后清」？拖拽期间是否确保源卡片留在 DOM 中？
- [ ] 新增主题变量是否在 `:root` / `.theme-dark` / `.theme-system` / `.theme-glass` 四处定义？
- [ ] 新增 `bg-white/NN` 是否加进两处黑名单，**并补了 hover 变体**？
- [ ] 实心按钮白字是否过 WCAG AA 4.5:1？
- [ ] 键盘交互是否走 `resolveMainKeyAction()`，且没动「Esc 在 `isEditableTarget` 之前」的顺序？
- [ ] **改默认配置值时，是否只改了 `shared/defaults.ts` 一处（而不是散落的 4 处）？**
- [ ] **热键相关改动是否保留了 `WM_SYSCOMMAND / SC_KEYMENU` 钩子（否则 Alt+Space 会弹系统菜单）？**
- [ ] 是否跑过 `npm run typecheck`（三个 tsconfig）与 `npm test`？
