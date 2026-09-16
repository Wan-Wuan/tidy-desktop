import fs from 'node:fs'
import path from 'node:path'

/**
 * 创建（或补齐）GitHub Release 并上传更新所需的安装包。
 *
 * 更新器只认 Release 里的 .exe 与 .exe.sha256，不读 latest.yml、也不用 blockmap，
 * 所以这里只传这两个文件。
 *
 * 用法：
 *   GITHUB_TOKEN=xxx node scripts/publish-github-release.mjs [version]
 * token 需要 Contents 写权限（经典 token 勾 repo）。
 */

const owner = 'Wan-Wuan'
const repo = 'tidy-desktop'
const apiBase = `https://api.github.com/repos/${owner}/${repo}`
const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = process.argv[2] || pkg.version
const tag = version.startsWith('v') ? version : `v${version}`
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

if (!token) {
  console.error('GITHUB_TOKEN (or GH_TOKEN) is required to publish the GitHub release.')
  console.error('Create one at https://github.com/settings/tokens with Contents write access.')
  process.exit(1)
}

const installerName = `tidy-desktop-Setup-${tag.slice(1)}.exe`
const assetFiles = [installerName, `${installerName}.sha256`].map((name) => {
  const file = path.join(root, 'release', name)
  if (!fs.existsSync(file)) {
    console.error(`Missing release asset: ${file}`)
    console.error('Run the build first: npm run electron:build')
    process.exit(1)
  }
  return file
})

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    }
  })
  if (!response.ok) {
    throw new Error(`GitHub API request failed: HTTP ${response.status} ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

// 先找同名 Release，没有再建——重复运行是安全的
let release = null
try {
  release = await request(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`)
} catch (error) {
  if (!String(error).includes('HTTP 404')) throw error
}

if (!release?.id) {
  release = await request(`${apiBase}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: tag,
      body: `Release ${tag}`,
      target_commitish: 'master',
      draft: false,
      prerelease: false
    })
  })
}

if (!release?.id) throw new Error(`GitHub did not return a Release ID for ${tag}`)

// 附件走独立的 uploads 域，且要求是裸二进制（不是 multipart）
const uploadedNames = new Set((release.assets || []).map((asset) => asset.name))
for (const file of assetFiles) {
  const name = path.basename(file)
  if (uploadedNames.has(name)) {
    console.log(`  skip ${name} (already uploaded)`)
    continue
  }
  await request(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: await fs.promises.readFile(file)
    }
  )
  console.log(`  uploaded ${name}`)
}

console.log(`GitHub release published: https://github.com/${owner}/${repo}/releases/tag/${tag}`)
