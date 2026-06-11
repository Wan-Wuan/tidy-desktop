import { pinyin } from 'pinyin-pro'

/**
 * 获取拼音字符串（无音调）
 */
export function getPinyin(name: string): string {
  try {
    return pinyin(name, { toneType: 'none', type: 'array' }).join('')
  } catch {
    return name.toLowerCase()
  }
}

/**
 * 获取拼音首字母
 */
export function getFirstLetter(name: string): string {
  try {
    return pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
  } catch {
    return name.charAt(0).toLowerCase()
  }
}
