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

final result: blocked
