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
  'electron-builder.yml',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.main.json',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js'
]

const dirtyRelevantFiles = new Set([
  ...read('git', ['diff', '--name-only', '--', ...releaseRelevantPaths]).trim().split(/\r?\n/).filter(Boolean),
  ...read('git', ['diff', '--name-only', '--cached', '--', ...releaseRelevantPaths]).trim().split(/\r?\n/).filter(Boolean)
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
run('npm', ['run', 'electron:build'])
run('git', ['add', 'package.json', 'package-lock.json'])
run('git', ['commit', '-m', `release: v${nextVersion}`])
run('git', ['tag', `v${nextVersion}`])

console.log(`\nRelease build complete: v${nextVersion}`)
console.log('Next commands:')
console.log('  git push origin HEAD')
console.log(`  git push origin v${nextVersion}`)
console.log(`  gh release create v${nextVersion} release/*${nextVersion}* --title "v${nextVersion}" --notes "Release v${nextVersion}"`)
