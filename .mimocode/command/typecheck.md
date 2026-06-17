---
description: Run TypeScript type checking for both renderer and main process
---

# Typecheck Command

Run TypeScript type checking across the project's dual tsconfig setup.

## Usage

```
npm run typecheck 2>&1
```

## What it checks

- **Renderer code** (`tsconfig.json`): React components, Vite-bundled code in `src/renderer/`
- **Main process code** (`tsconfig.main.json`): Electron main process, CommonJS modules in `src/main/`
- **Shared types** (`src/shared/`): Type definitions used by both

## When to run

- After any `.ts` or `.tsx` file modification
- Before committing changes
- After merging branches
- As part of code review verification

## Expected output

Success: no output (exit code 0)

Failure: TypeScript error messages with file paths and line numbers

## Common errors and fixes

| Error | Fix |
|-------|-----|
| `Property 'X' does not exist on type 'Electron'` | Add method to `src/shared/electron.d.ts` |
| `Cannot find module '...'` | Check import path and file existence |
| `Type 'X' is not assignable to type 'Y'` | Fix type mismatch or update shared types |
