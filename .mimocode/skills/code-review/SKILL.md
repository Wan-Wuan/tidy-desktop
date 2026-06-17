---
name: code-review
description: Systematic code review, bug detection, and fix workflow for Electron/TypeScript projects
---

# Code Review & Bug Fix Workflow

A structured workflow for reviewing code, identifying issues, prioritizing them, and applying fixes with verification.

## When to use

- User asks to "review code", "check for bugs", "find issues", "optimize code"
- User says "检查代码", "找bug", "优化代码", "代码审查"
- After significant code changes to verify quality

## Workflow

### Phase 1: Exploration

1. **Identify scope**: Ask which files/directories to review, or scan the full project
2. **Spawn explore agent** for parallel analysis of:
   - `src/main/` — Electron main process (IPC handlers, security, async patterns)
   - `src/renderer/` — React components (memory leaks, state management, performance)
   - `src/shared/` — Shared types and utilities
3. **Collect findings** with file path, line number, issue type, and severity

### Phase 2: Prioritization

Categorize each finding:

| Priority | Description | Examples |
|----------|-------------|---------|
| **P0** | Urgent — security, crashes, data loss | Command injection, memory leaks, unhandled exceptions |
| **P1** | High — correctness, reliability | Race conditions, missing error handling, blocking calls |
| **P2** | Medium — quality, maintainability | Code duplication, dead code, missing types |
| **P3** | Low — style, minor improvements | Naming, comments, formatting |

Present the full list to the user and ask which priorities to fix.

### Phase 3: Fix Application

For each fix:
1. Read the affected file(s)
2. Apply the minimal change needed
3. Run `npm run typecheck` to verify no type errors
4. Run `npm run build` if structural changes were made

### Phase 4: Verification

1. Run `npm run typecheck 2>&1` — must pass with zero errors
2. Run `npm run build 2>&1` — must complete successfully
3. Summarize all changes made with before/after descriptions

## Common Issue Patterns (Electron + React + TypeScript)

### Security
- **Command injection**: All user paths in `execSync`/`exec` must use single-quote escaping
- **IPC validation**: Validate all `event.sender` and parameters in `ipcMain.handle`

### Memory & Performance
- **IPC listener leaks**: Every `on`/`once` in useEffect must return cleanup function
- **Stale closures**: Use refs for values accessed in callbacks
- **Transparent windows**: Use `onMouseDown` not `onClick` for overlay elements

### Code Quality
- **Duplicate utilities**: Extract shared pure functions to `src/shared/utils.ts`
- **Dead code**: Remove unreachable branches and unused variables
- **Type safety**: Ensure `electron.d.ts` matches actual IPC channel signatures

## Output Format

After completing the review, provide:

```
## Review Summary

**Files reviewed**: N files
**Issues found**: N (P0: X, P1: Y, P2: Z, P3: W)
**Issues fixed**: N
**Verification**: typecheck ✓ | build ✓

### Fixes Applied
1. [P0-1] Fixed command injection in handlers/fileHandlers.ts:45
2. [P1-2] Added IPC listener cleanup in App.tsx useEffect
...
```

## Tips

- Use `grep` to search for patterns like `execSync`, `ipcMain.on`, `useEffect` to find common issue areas
- Check `src/shared/electron.d.ts` against actual IPC handlers for type mismatches
- Look for `alert()` calls that should be replaced with proper UI notifications
- Verify all `fetch` calls have error handling and timeouts
