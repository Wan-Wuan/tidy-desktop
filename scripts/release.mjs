import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const bump = process.argv[2] || 'patch'
const validBumps = new Set(['patch', 'minor', 'major'])

function run(command, args) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command
  execFileSync(executable, args, { stdio: 'inherit' })
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
  run('npm', ['run', 'electron:build'])
  run('git', ['add', 'package.json', 'package-lock.json'])
  run('git', ['commit', '-m', `release: v${nextVersion}`])
  releaseCommitted = true
  run('git', ['tag', `v${nextVersion}`])
} catch (error) {
  if (!releaseCommitted) {
    fs.writeFileSync(packagePath, originalPackage, 'utf8')
    if (originalLock !== null) fs.writeFileSync(lockPath, originalLock, 'utf8')
    run('git', ['add', 'package.json', 'package-lock.json'])
  }
  console.error(`Release failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

console.log(`\nRelease build complete: v${nextVersion}`)
console.log('Next commands:')
console.log('  git push origin HEAD')
console.log(`  git push origin v${nextVersion}`)
console.log(`  gh release create v${nextVersion} release/*${nextVersion}* --title "v${nextVersion}" --notes "Release v${nextVersion}"`)
