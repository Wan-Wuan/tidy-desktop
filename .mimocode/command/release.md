---
description: Bump version and build Electron installer package
---

# Version Release Command

Bump the project version and build a Windows exe installer.

## Usage

```
$ARGUMENTS
```

Where `$ARGUMENTS` is the new version number (e.g., "1.8.3" or "v1.8.3").

## Workflow

### Step 1: Update version

Edit `package.json` and set the `version` field to the new version number.

```bash
# Current version can be found in:
cat package.json | grep '"version"'
```

### Step 2: Build installer

```bash
npm run electron:build 2>&1
```

This runs `electron-builder` which:
1. Compiles TypeScript
2. Bundles renderer with Vite
3. Packages into Windows exe installer
4. Output in `release/` directory

### Step 3: Verify output

Check that the installer was created:
```bash
ls -la release/*.exe
```

## Output

- Installer: `release/tidy-desktop Setup X.X.X.exe`
- Build artifacts: `release/` directory

## Notes

- The `electron-builder.yml` config controls build settings
- Output directory is configured as `release` (not `release-vX.X.X`)
- First build may take 2-5 minutes; subsequent builds are faster
- Ensure `npm run typecheck` passes before building
