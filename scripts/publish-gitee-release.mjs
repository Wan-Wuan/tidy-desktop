import fs from 'node:fs'
import path from 'node:path'

const owner = 'wanwuan'
const repo = 'tidy_desktop'
const apiBase = `https://gitee.com/api/v5/repos/${owner}/${repo}`
const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = process.argv[2] || pkg.version
const tag = version.startsWith('v') ? version : `v${version}`
const token = process.env.GITEE_TOKEN

if (!token) {
  console.error('GITEE_TOKEN is required to publish the Gitee update mirror.')
  process.exit(1)
}

const installerName = `tidy-desktop-Setup-${tag.slice(1)}.exe`
const assets = [
  installerName,
  `${installerName}.sha256`,
  `${installerName}.blockmap`
].map((name) => path.join(root, 'release', name))

for (const file of assets) {
  if (!fs.existsSync(file)) {
    console.error(`Missing release asset: ${file}`)
    process.exit(1)
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  })
  if (!response.ok) {
    throw new Error(`Gitee API request failed: HTTP ${response.status} ${await response.text()}`)
  }
  return response.json()
}

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
      target_commitish: 'master'
    })
  })
}

if (!release?.id) {
  release = await request(`${apiBase}/releases/tags/${encodeURIComponent(tag)}`)
}
if (!release?.id) throw new Error(`Gitee did not return a Release ID for ${tag}`)

for (const file of assets) {
  const form = new FormData()
  form.set('file', await fs.openAsBlob(file), path.basename(file))
  await request(`${apiBase}/releases/${release.id}/attach_files`, {
    method: 'POST',
    body: form
  })
}

console.log(`Gitee mirror published: https://gitee.com/${owner}/${repo}/releases/tag/${tag}`)
