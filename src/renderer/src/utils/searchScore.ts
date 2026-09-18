import type { AppItem } from '../../../shared/types'

// 按空白与常见分隔符切词，供「逐词首字母 / 逐词前缀」匹配使用
function splitSearchWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[\s\-_.,/\\|()[\]{}]+/)
    .map(word => word.trim())
    .filter(Boolean)
}

// 去掉所有非字母数字和汉字的字符，用于「去掉空格/符号后仍能命中」的模糊匹配
function compactSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

// 把应用预存的小写字段（name/pinyin/firstLetter/aliases）展开成各种匹配维度。
// 注意 pinyin / firstLetter 取自 app 上的预存值，而不是现场用 pinyin-pro 计算，
// 这样才能和首屏渲染、卡片高亮时的匹配逻辑保持同一套数据。
function getSearchFields(app: AppItem) {
  const name = app.name.toLowerCase()
  const pinyin = (app.pinyin || '').toLowerCase()
  const firstLetter = (app.firstLetter || '').toLowerCase()
  const aliases = (app.aliases || []).map(alias => alias.toLowerCase())
  const nameWords = splitSearchWords(name)
  const pinyinWords = splitSearchWords(pinyin)
  const wordInitials = nameWords.map(word => word[0]).join('')
  const pinyinInitials = pinyinWords.map(word => word[0]).join('')
  const compactName = compactSearchText(name)
  const compactPinyin = compactSearchText(pinyin)

  return {
    name,
    pinyin,
    firstLetter,
    aliases,
    nameWords,
    pinyinWords,
    wordInitials,
    pinyinInitials,
    compactName,
    compactPinyin
  }
}

/**
 * 单个关键词是否命中某个应用。空关键词视为全匹配。
 * 命中优先级从强到弱：别名 =、全名 =、前缀、拼音、首字母、逐词前缀、紧凑串前缀。
 */
export function matchesTerm(app: AppItem, term: string): boolean {
  const fields = getSearchFields(app)
  const compactTerm = compactSearchText(term)

  if (!compactTerm) return true
  if (fields.aliases.some(alias => alias.includes(term))) return true
  if (fields.name.includes(term)) return true
  if (fields.pinyin.includes(term)) return true
  if (fields.firstLetter.startsWith(compactTerm)) return true
  if (fields.wordInitials.startsWith(compactTerm)) return true
  if (fields.pinyinInitials.startsWith(compactTerm)) return true
  if (fields.nameWords.some(word => word.startsWith(term))) return true
  if (fields.pinyinWords.some(word => word.startsWith(term))) return true

  // 紧凑串（去符号）匹配至少要两个字，避免单字误伤
  return compactTerm.length >= 2 && (
    fields.compactName.startsWith(compactTerm) ||
    fields.compactPinyin.startsWith(compactTerm)
  )
}

/**
 * 给应用打分，分数高者排在搜索结果前面。基础分来自启动次数与最近打开时间，
 * 每个命中维度再叠加不同权重（越精确的匹配权重越高）。
 */
export function getSearchScore(app: AppItem, terms: string[]): number {
  const fields = getSearchFields(app)

  let score = (app.launchCount || 0) * 8 + Math.min(20, Math.floor((app.lastOpenedAt || 0) / 86400000))
  for (const term of terms) {
    const compactTerm = compactSearchText(term)
    if (fields.aliases.some(alias => alias === term)) score += 120
    if (fields.name === term) score += 100
    if (fields.name.startsWith(term)) score += 80
    if (fields.compactName.startsWith(compactTerm)) score += 70
    if (fields.nameWords.some(word => word.startsWith(term))) score += 65
    if (fields.firstLetter.startsWith(compactTerm)) score += 60
    if (fields.wordInitials.startsWith(compactTerm)) score += 55
    if (fields.pinyin.startsWith(term)) score += 50
    if (fields.compactPinyin.startsWith(compactTerm)) score += 45
    if (fields.pinyinWords.some(word => word.startsWith(term))) score += 40
    if (fields.aliases.some(alias => alias.includes(term))) score += 35
    if (fields.name.includes(term)) score += 30
    if (fields.pinyin.includes(term)) score += 25
  }
  return score
}

// 供 SearchApp 其余逻辑复用（命令/搜索引擎关键词的紧凑化比较）
export { compactSearchText }
