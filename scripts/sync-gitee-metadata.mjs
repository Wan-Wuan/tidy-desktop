// 从 GitHub 同步 Release 说明与仓库描述到 Gitee。
// 用法：GITEE_TOKEN=xxx node scripts/sync-gitee-metadata.mjs
// 只同步文字信息；安装包资产仍由 publish-gitee-release.mjs 管理。
import { execFileSync } from 'node:child_process'

const GITHUB_REPO = 'Wan-Wuan/tidy-desktop'
const GITEE_OWNER = 'wanwuan'
const GITEE_REPO = 'tidy_desktop'
const giteeApiBase = `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}`

const token = process.env.GITEE_TOKEN
if (!token) {
  console.error('GITEE_TOKEN is required')
  process.exit(1)
}

function gh(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
}

async function gitee(path, options = {}) {
  const url = new URL(path.startsWith('http') ? path : `${giteeApiBase}${path}`)
  url.searchParams.set('access_token', token)
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`Gitee ${options.method || 'GET'} ${url.pathname}: HTTP ${response.status} ${await response.text()}`)
  }
  return response.json()
}

function listAll(githubPath) {
  const items = []
  for (let page = 1; page <= 10; page++) {
    const chunk = gh(`${githubPath}?per_page=100&page=${page}`)
    items.push(...chunk)
    if (chunk.length < 100) break
  }
  return items
}

// ── 1. 仓库描述与主页（GitHub 未填写时回落到 package.json 的中文描述）──
const ghRepo = gh(`repos/${GITHUB_REPO}`)
const pkg = JSON.parse((await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const repoDescription = ghRepo.description || pkg.description || ''
const repoHomepage = ghRepo.homepage || pkg.homepage || ''
await gitee('', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: GITEE_REPO,
    description: repoDescription,
    homepage: repoHomepage
  })
})
console.log(`repo description synced: "${repoDescription}"`)

// ── 2. Release 说明 ──
const githubReleases = listAll(`repos/${GITHUB_REPO}/releases`)
  .filter(release => !release.draft && release.tag_name)
  // GitHub 上存在同名 tag 的历史重复条目，保留最新一条
  .filter((release, index, all) => all.findIndex(item => item.tag_name === release.tag_name) === index)

async function listAllGitee() {
  const items = []
  for (let page = 1; page <= 20; page++) {
    const chunk = await gitee(`/releases?per_page=50&page=${page}`)
    if (!Array.isArray(chunk)) throw new Error(`unexpected gitee response: ${JSON.stringify(chunk).slice(0, 200)}`)
    items.push(...chunk)
    if (chunk.length < 50) break
  }
  return items
}
const giteeReleases = await listAllGitee()

const giteeByTag = new Map(giteeReleases.map(release => [release.tag_name, release]))

// 本地 tag → commit 映射（tag 已全部推送到 Gitee，创建 Release 时锚定到对应提交）
const tagCommit = new Map()
try {
  const lines = execFileSync('git', ['show-ref', '--tags'], { encoding: 'utf8' }).trim().split(new RegExp('\r?\n'))
  for (const line of lines) {
    const [sha, ref] = line.split(/\s+/)
    const tag = ref.replace('refs/tags/', '')
    // annotated tag 的 show-ref 指向 tag 对象，取解引用后的提交
    const commit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim()
    tagCommit.set(tag, commit)
  }
} catch { /* 没有本地 tag 时跳过 */ }
let created = 0
let updated = 0

for (const release of githubReleases) {
  const payload = {
    tag_name: release.tag_name,
    name: release.name || release.tag_name,
    body: release.body || `Release ${release.tag_name}`,
    prerelease: release.prerelease === true
  }
  const existing = giteeByTag.get(release.tag_name)
  if (existing) {
    // 已有说明一致时跳过，减少无谓写入
    if ((existing.body || '') === payload.body && (existing.name || '') === payload.name) continue
    await gitee(`/releases/${existing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: payload.tag_name,
        name: payload.name,
        body: payload.body,
        prerelease: payload.prerelease
      })
    })
    updated++
    console.log(`updated: ${release.tag_name}`)
  } else {
    await gitee('/releases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        target_commitish: tagCommit.get(release.tag_name) || 'master'
      })
    })
    created++
    console.log(`created: ${release.tag_name}`)
  }
}

console.log(`\ndone: ${githubReleases.length} releases on GitHub, ${created} created, ${updated} updated on Gitee`)
