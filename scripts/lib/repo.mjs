// 双平台仓库信息集中维护点。
//
// 之前 owner/repo 散落在各发布脚本里硬编码，容易改一处漏一处。
// 这里统一导出，并特别注意 GitHub 与 Gitee 的大小写差异：
//   GitHub -> Wan-Wuan/tidy-desktop（owner 含大写 W）
//   Gitee  -> wanwuan/tidy_desktop（全小写，且连字符变下划线）
// 主进程 src/main/update/index.ts 里的 GITHUB_API / GITEE_API 仍硬编码，
// 建议未来也抽到 src/shared 复用，但本次不动主进程代码。

export const github = {
  owner: 'Wan-Wuan',
  repo: 'tidy-desktop',
  // REST API 基址（读取/创建 Release）
  apiBase: 'https://api.github.com/repos/Wan-Wuan/tidy-desktop',
  // 附件上传走独立的 uploads 域
  uploadsBase: 'https://uploads.github.com/repos/Wan-Wuan/tidy-desktop',
  // 网页基址（用于拼出 Release 页面 URL）
  webBase: 'https://github.com/Wan-Wuan/tidy-desktop',
}

export const gitee = {
  owner: 'wanwuan',
  repo: 'tidy_desktop',
  apiBase: 'https://gitee.com/api/v5/repos/wanwuan/tidy_desktop',
  webBase: 'https://gitee.com/wanwuan/tidy_desktop',
}
