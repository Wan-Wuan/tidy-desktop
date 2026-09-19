# Design QA

## Comparison target

- Source visual truth:
  - `public/layout-previews/command-rail.png`
  - `public/layout-previews/horizon-workspace.png`
  - `public/layout-previews/studio-split.png`
- Intended viewport: 1440 × 1024 CSS pixels at device scale factor 1.
- State: light/aurora theme, populated application library, default card size.
- Implementation screenshot: not captured.
- User-provided pre-fix evidence: `docs/audit/01-current-interface.png` (1300 × 953 pixels).

## Evidence

- Source images are 1488 × 1058 pixels and represent the three selected desktop layout templates.
- The accepted pre-fix screenshot shows every top-level category with the same blue underline, while only “全部” is selected. It also shows subcategory controls without a persistent current-location indicator and no visible window-resize affordance.
- Production renderer build, Electron main-process build, TypeScript checks, and automated tests pass.
- Browser-rendered implementation evidence is unavailable because the in-app browser control surface is not callable in this task.
- Focused-region comparison was not possible without a browser-rendered implementation screenshot.
- Primary interactions and browser console errors have not yet been verified visually.

## Findings

- [P1] Visual fidelity is not yet verified
  - Location: all three main-window templates and the Settings → Interface template picker.
  - Evidence: source visual targets are available, but there is no same-viewport implementation capture.
  - Impact: layout overflow, density, or styling differences could remain unnoticed despite successful compilation.
  - Fix: capture each template at 1440 × 1024, compare it with its matching source image, correct any P0/P1/P2 differences, then repeat the comparison.

- [P1] Category selection was visually ambiguous
  - Location: horizontal workspace top-level category navigation.
  - Evidence: the pre-fix screenshot shows blue underlines below all categories.
  - Impact: users cannot tell which category is active.
  - Fix made: active styling now uses an explicit `data-active` state instead of matching a class string that also contained hover styles. Only the current category receives the underline and stronger type weight.

- [P2] Subcategory location was not persistent
  - Location: subcategory navigation and grouped app content.
  - Evidence: the pre-fix screenshot shows identical styling for “专业”, “学习”, and “远程操控”.
  - Impact: after scrolling, users lose their location in a long category.
  - Fix made: click and content scrolling now synchronize a persistent active subcategory state with `aria-current="location"`.

- [P2] Window resizing lacked a visible affordance
  - Location: outer window edges and lower-right corner.
  - Evidence: no visible resize grip is present in the pre-fix screenshot.
  - Impact: users may not discover that the window can be resized.
  - Fix made: all four edges and four corners now expose drag targets, the lower-right corner has a visible resize icon, and the resulting size is saved.

## Open Questions

- Permission is required before using the local Playwright CLI as the fallback screenshot tool.

## Implementation Checklist

1. Capture the three templates and the settings picker at the target viewport.
2. Verify template switching, search trigger, category selection, subcategory scroll synchronization, edge resizing, and settings/window-size persistence.
3. Check renderer console errors.
4. Compare each capture with its matching source image.
5. Fix any P0/P1/P2 findings and update this report.

## Follow-up Polish

- Evaluate 600–820 px window widths after the desktop fidelity pass.

## Comparison History

### Iteration 1

- Earlier findings: all top-level categories appeared active; subcategories had no current indicator; resizing was undiscoverable.
- Fixes made: explicit active-state attributes, scroll-synchronized subcategory state, eight resize drag zones, visible lower-right grip, and debounced window-size persistence.
- Post-fix visual evidence: not yet captured because the in-app browser control surface is unavailable and Playwright fallback permission has not been provided.
- 2026-09-19 复查：本机**没有** Playwright / Puppeteer（`node_modules` 里均不存在），
  且当前环境的 npm 装不了包（`npm install` 无输出、非零退出）。

### 2026-09-19：尝试用 Electron 自带截图补上这一步（未成功，但结论可复用）

思路：`webContents.capturePage()` 不需要任何额外依赖，项目里也已在用
（`scripts/main-preview-renderer.cjs` 渲染图标预览）。因此写了一个宿主脚本，
重定向 `userData` 到仓库内的隔离目录（**不碰用户真实数据**），种入样例应用/分类，
以 1440×1024 逐模板截图，然后 `app.exit(0)`。

**实测走不通的两个原因**（下次别再从这条路开始）：

1. **从项目目录里以「文件」方式启动的 Electron 脚本，拿不到主进程 API。**
   `require('electron')` 解析到的是 `node_modules/electron/index.js` 这个包——
   它只为第三方工具导出**可执行文件路径字符串**，于是 `app` 是 `undefined`。
   换 `electron/main`、`electron/js2c/browser_init` 同样拿不到；
   改成「目录式应用」（带 `package.json` 的 app 目录）启动也没能跑起来。
   （真实应用之所以正常，是因为它由 `electron .` 以应用入口加载。）
2. **本环境的工具通道无法可靠地驱动 GUI 进程**：`electron.exe` 是 GUI 子系统程序，
   重定向 stdout/stderr 常拿不到任何输出，失败了也看不到原因；
   进程既没写错误文件、也没产出图片，只能看到空的退出码。

**下一步的可选路径（按推荐度）**：

- **（推荐）由人在真实终端里跑**：脚本思路已验证可行（隔离数据 + capturePage），
  在有控制台输出的环境里运行就能看到失败原因，产物落到 `build/layout-qa/`。
  需要注意的是它依赖构建产物（`npm run build` + `npm run build:main`），
  且应用不能正在运行（`requestSingleInstanceLock`）。
- 装 Playwright 后用 `_electron.launch()` 驱动真实应用截图（需要能装包的 npm 环境）。
- 若只想验证**布局与排版**而不追求真实渲染，可退回到
  `scripts/main-preview-renderer.cjs` 那种 mock 方式，但这只能作为弱证据。

final result: blocked
