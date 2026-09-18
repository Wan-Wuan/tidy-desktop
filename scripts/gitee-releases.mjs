/**
 * 批量清理 Gitee 仓库上低于指定版本的 Release（发行版）与 git tag。
 *
 * 用法（在项目根目录执行）：
 *   node scripts/gitee-releases.mjs list
 *   node scripts/gitee-releases.mjs delete --below 2.6.8                 # 预演，不改动任何东西
 *   node scripts/gitee-releases.mjs delete --below 2.6.8 --releases --yes # 真删发行版
 *   node scripts/gitee-releases.mjs delete --below 2.6.8 --tags --yes     # 真删 gitee 上的 tag
 *
 * 说明：
 *   - Release 走 Gitee OpenAPI v5，需要 GITEE_TOKEN（私人令牌，projects 权限）。
 *   - tag 走 git push --delete，使用 git 已有的 gitee 凭据，不需要 API 令牌。
 *   - 默认只预演；必须显式加 --yes 才真正删除。
 *   - 结果写入 .gitee-cleanup.json 便于核对。
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'

import { gitee } from './lib/repo.mjs'

const { owner, repo, apiBase } = gitee
const root = process.cwd()
const reportFile = path.join(root, '.gitee-cleanup.json')
const token = process.env.GITEE_TOKEN

const argv = process.argv.slice(2)
const command = argv[0] || 'list'
const flag = (name) => argv.includes(`--${name}`)
const value = (name) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}

/** 解析版本号：v2.6.10 -> [2,6,10] */
function parseVersion(input) {
  const m = String(input || '').trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)$/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function compareVersion(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

const belowRaw = value('below')
const below = parseVersion(belowRaw)

function belowThreshold(tag) {
  const v = parseVersion(tag)
  if (!v || !below) return false
  return compareVersion(v, below) < 0
}

function git(args, { timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: root, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function api(url, options = {}) {
  const u = new URL(url)
  u.searchParams.set('access_token', token)
  const res = await fetch(u, options)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`)
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

async function listReleases() {
  const all = []
  for (let page = 1; ; page++) {
    const batch = await api(`${apiBase}/releases?page=${page}&per_page=100&direction=desc`)
    if (!Array.isArray(batch) || batch.length === 0) break
    all.push(...batch)
    if (batch.length < 100) break
  }
  // 注意：列表返回的 assets 只有 name/browser_download_url，没有 id。
  // 真实附件（含 .zip/.tar.gz 是 tag 的虚拟归档，不在此列）要单独查 attach_files。
  return all.map((r) => ({
    id: r.id,
    tag: r.tag_name,
    name: r.name,
    created_at: r.created_at,
    assetNames: (r.assets || []).map((a) => a.name)
  }))
}

/** 查某个 Release 的真实附件（带 id） */
async function listAttachFiles(releaseId) {
  const res = await api(`${apiBase}/releases/${releaseId}/attach_files`)
  return Array.isArray(res) ? res.map((f) => ({ id: f.id, name: f.name, size: f.size })) : []
}

async function listGiteeTags() {
  const res = await git(['ls-remote', '--tags', 'gitee'])
  const tags = []
  for (const line of res.stdout.split('\n')) {
    const m = line.match(/refs\/tags\/(.+?)(\^\{\})?$/)
    if (!m) continue
    if (m[2]) continue // 跳过 peeled ref
    tags.push(m[1])
  }
  return [...new Set(tags)].sort()
}

function writeReport(payload) {
  fs.writeFileSync(reportFile, JSON.stringify(payload, null, 2), 'utf8')
}

// ---------- list ----------
if (command === 'list') {
  const result = { command, releases: null, tags: null, error: null }
  if (token) {
    try { result.releases = await listReleases() } catch (e) { result.error = String(e) }
  } else {
    result.error = 'GITEE_TOKEN not set'
  }
  result.tags = await listGiteeTags()
  writeReport(result)
  process.exit(0)
}

// ---------- delete ----------
if (command !== 'delete') {
  console.error(`Unknown command: ${command}`)
  process.exit(1)
}

if (!below) {
  console.error('Usage: node scripts/gitee-releases.mjs delete --below <version> [--releases] [--tags] [--yes]')
  process.exit(1)
}

const doReleases = flag('releases') || (!flag('tags') && !flag('releases'))
const doTags = flag('tags') || (!flag('releases') && !flag('tags'))
const confirmed = flag('yes')

const plan = { command: confirmed ? 'delete' : 'dry-run', below: belowRaw, releases: [], tags: [], results: [] }

// 目标 Release
if (doReleases) {
  if (!token) {
    console.error('GITEE_TOKEN is required to delete releases.')
    process.exit(1)
  }
  const releases = await listReleases()
  const kept = releases.filter((r) => !belowThreshold(r.tag))
  plan.releaseTotal = releases.length
  for (const r of releases.filter((r) => belowThreshold(r.tag))) {
    plan.releases.push({ id: r.id, tag: r.tag, created_at: r.created_at, attachFiles: await listAttachFiles(r.id) })
  }
  plan.releasesKept = kept.map((r) => r.tag)
}

// 目标 tag（仅 Gitee 远端，本地与 GitHub 不动）
if (doTags) {
  const tags = await listGiteeTags()
  plan.tagTotal = tags.length
  plan.tags = tags.filter((t) => belowThreshold(t))
  plan.tagsKept = tags.filter((t) => !belowThreshold(t))
}

if (!confirmed) {
  writeReport(plan)
  console.log(`DRY RUN — below ${belowRaw}`)
  console.log(`  releases to delete: ${plan.releases.length} (of ${plan.releaseTotal ?? '?'})`)
  console.log(`  tags to delete:     ${plan.tags.length} (of ${plan.tagTotal ?? '?'})`)
  process.exit(0)
}

// ---- 真删 Release（先删附件，再删发行版；.zip/.tar.gz 是 tag 虚拟归档，随 tag 消失）----
for (const r of plan.releases) {
  try {
    for (const file of r.attachFiles) {
      try {
        await api(`${apiBase}/releases/${r.id}/attach_files/${file.id}`, { method: 'DELETE' })
        plan.results.push({ kind: 'asset', tag: r.tag, asset: file.name, ok: true })
      } catch (e) {
        plan.results.push({ kind: 'asset', tag: r.tag, asset: file.name, ok: false, error: String(e) })
      }
    }
    await api(`${apiBase}/releases/${r.id}`, { method: 'DELETE' })
    plan.results.push({ kind: 'release', tag: r.tag, ok: true })
  } catch (e) {
    plan.results.push({ kind: 'release', tag: r.tag, ok: false, error: String(e) })
  }
}

// ---- 真删 tag（只删 Gitee 远端；本地 tag 与 GitHub 保持不变）----
const BATCH = 20
for (let i = 0; i < plan.tags.length; i += BATCH) {
  const batch = plan.tags.slice(i, i + BATCH)
  const refs = batch.map((t) => `refs/tags/${t}`)
  const res = await git(['push', 'gitee', '--delete', ...refs])
  plan.results.push({
    kind: 'tags-batch',
    tags: batch,
    ok: res.ok,
    stderr: res.stderr,
    ...(res.ok ? {} : { error: res.stderr || `exit ${res.code}` })
  })
}

writeReport(plan)
const okCount = plan.results.filter((r) => r.kind === 'release' && r.ok).length
const failCount = plan.results.filter((r) => r.ok === false).length
console.log(`done: ${okCount} release(s) deleted, ${failCount} failure(s). See .gitee-cleanup.json`)
