import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const bump = process.argv[2] || 'patch'
const validBumps = new Set(['patch', 'minor', 'major'])

function run(command, args) {
  if (process.platform === 'win32' && command === 'npm') {
    const npmScript = path.join(path.dirname(process.execPath), 'npm.ps1')
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', npmScript, ...args], {
      stdio: 'inherit'
    })
    return
  }
  execFileSync(command, args, { stdio: 'inherit' })
}

function read(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' })
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function writeInstallerChecksum(version) {
  const installerName = `tidy-desktop-Setup-${version}.exe`
  const installerPath = path.join(root, 'release', installerName)
  if (!fs.existsSync(installerPath)) {
    throw new Error(`Release installer was not generated: ${installerPath}`)
  }
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(installerPath)).digest('hex')
  fs.writeFileSync(`${installerPath}.sha256`, `${checksum}  ${installerName}\n`, 'utf8')
}

// 清理 release/ 里与本次版本无关的旧安装包与校验文件，避免把上一版的产物一并上传。
// 更新器只读与当前版本同名的 .exe / .sha256，留着旧文件只会让目录越来越乱。
function cleanReleaseDir(version) {
  const installerName = `tidy-desktop-Setup-${version}.exe`
  const dir = path.join(root, 'release')
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir)) {
    if (entry === installerName || entry === `${installerName}.sha256`) continue
    if (entry.endsWith('.exe') || entry.endsWith('.sha256')) {
      fs.rmSync(path.join(dir, entry), { force: true })
    }
  }
}

// 发布前提醒核对 CHANGELOG：仅警告、不阻断，避免漏写更新说明却已打出版本。
function checkChangelog(version) {
  const file = path.join(root, 'CHANGELOG.md')
  if (!fs.existsSync(file)) {
    console.warn(`\n⚠️  警告：未找到 CHANGELOG.md，发布 v${version} 前建议补充更新说明。`)
    return
  }
  const text = fs.readFileSync(file, 'utf8')
  if (!text.includes(version)) {
    console.warn(
      `\n⚠️  警告：CHANGELOG.md 中未发现 v${version} 的条目，` +
        `请确认已记录本次更新内容后再发布（这是提醒，不会阻断发布）。`
    )
  }
}

if (!validBumps.has(bump)) {
  console.error('Usage: npm run release -- patch|minor|major')
  process.exit(1)
}

const root = process.cwd()
const packagePath = path.join(root, 'package.json')
const lockPath = path.join(root, 'package-lock.json')
const releaseRelevantPaths = [
  'src',
  'shared',
  'scripts',
  'build',
  'public',
  'index.html',
  'search.html',
  'electron-builder.yml',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.main.json',
  'tsconfig.node.json',
  'vitest.config.ts',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js'
]

const dirtyRelevantFiles = new Set([
  ...read('git', ['diff', '--name-only', '--', ...releaseRelevantPaths]).trim().split(/\r?\n/).filter(Boolean),
  ...read('git', ['diff', '--name-only', '--cached', '--', ...releaseRelevantPaths]).trim().split(/\r?\n/).filter(Boolean),
  ...read('git', ['ls-files', '--others', '--exclude-standard', '--', ...releaseRelevantPaths]).trim().split(/\r?\n/).filter(Boolean)
])

if (dirtyRelevantFiles.size > 0) {
  console.error('Release blocked: commit release-relevant changes before packaging:')
  for (const file of [...dirtyRelevantFiles].sort()) {
    console.error(`  ${file}`)
  }
  process.exit(1)
}

const pkg = readJson(packagePath)
const current = String(pkg.version || '0.0.0').split('.').map(Number)
const originalPackage = fs.readFileSync(packagePath, 'utf8')
const originalLock = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : null

while (current.length < 3) current.push(0)
if (bump === 'major') {
  current[0] += 1
  current[1] = 0
  current[2] = 0
} else if (bump === 'minor') {
  current[1] += 1
  current[2] = 0
} else {
  current[2] += 1
}

const nextVersion = current.join('.')
const tagExists = read('git', ['tag', '--list', `v${nextVersion}`]).trim() === `v${nextVersion}`
if (tagExists) {
  console.error(`Release blocked: tag v${nextVersion} already exists`)
  process.exit(1)
}

// 发布前先提示核对更新说明（仅警告）。
checkChangelog(nextVersion)

if (process.platform === 'win32' && !process.env.CSC_LINK && process.env.ALLOW_UNSIGNED_RELEASE !== '1') {
  console.error('Release blocked: CSC_LINK is required for a signed Windows release.')
  console.error('Set ALLOW_UNSIGNED_RELEASE=1 only for local test packages.')
  process.exit(1)
}

let releaseCommitted = false
try {
  pkg.version = nextVersion
  writeJson(packagePath, pkg)

  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath)
    lock.version = nextVersion
    if (lock.packages?.['']) {
      lock.packages[''].version = nextVersion
    }
    writeJson(lockPath, lock)
  }

  run('npm', ['run', 'typecheck'])
  run('npm', ['run', 'test'])
  // 打包前先清掉上一版残留的安装包与校验文件，避免旧产物被一并发布。
  cleanReleaseDir(nextVersion)
  run('npm', ['run', 'electron:build'])
  writeInstallerChecksum(nextVersion)
  run('git', ['add', 'package.json', 'package-lock.json'])
  run('git', ['commit', '-m', `release: v${nextVersion}`])
  releaseCommitted = true
  run('git', ['tag', `v${nextVersion}`])
} catch (error) {
  // 回滚策略：
  //   - commit 之前失败 -> 直接还原版本文件即可；
  //   - commit 之后失败（典型如打 tag 失败）-> 先撤销 commit，避免留下
  //     「已提交但无 tag」的半成品，再还原版本文件。
  if (releaseCommitted) {
    try {
      run('git', ['reset', '--soft', 'HEAD~1'])
    } catch (resetError) {
      console.error(`回滚 commit 失败：${resetError instanceof Error ? resetError.message : String(resetError)}`)
    }
  }
  fs.writeFileSync(packagePath, originalPackage, 'utf8')
  if (originalLock !== null) fs.writeFileSync(lockPath, originalLock, 'utf8')
  // 还原暂存区与工作区：无论这些文件此前是否被 git add 过，都回到发布前的状态。
  try {
    run('git', ['restore', '--staged', 'package.json', 'package-lock.json'])
    run('git', ['checkout', '--', 'package.json', 'package-lock.json'])
  } catch {
    // 文件本就无改动时 checkout 会失败，忽略即可。
  }
  console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

console.log(`\nRelease build complete: v${nextVersion}`)
console.log('Next commands:')
console.log('  git push origin HEAD')
console.log(`  git push origin v${nextVersion}`)
console.log(`  gh release create v${nextVersion} release/*${nextVersion}* --title "v${nextVersion}" --notes "Release v${nextVersion}"`)
