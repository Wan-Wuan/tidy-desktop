const MIN_DISPLAYABLE_ICON_LENGTH = 200
const LEGACY_VALIDATION_CAP = 8192
const LEGACY_TRUNCATED_ICON_FLOOR = 8000

export function isLikelyLegacyTruncatedIcon(icon?: string | null): boolean {
  return Boolean(
    icon &&
    icon.startsWith('data:image/') &&
    icon.length >= LEGACY_TRUNCATED_ICON_FLOOR &&
    icon.length <= LEGACY_VALIDATION_CAP
  )
}

export function hasDisplayableIcon(icon?: string | null): boolean {
  return Boolean(
    icon &&
    icon.startsWith('data:image/') &&
    icon.length >= MIN_DISPLAYABLE_ICON_LENGTH &&
    !isLikelyLegacyTruncatedIcon(icon)
  )
}

export function needsIconUpdate(icon?: string | null): boolean {
  return !hasDisplayableIcon(icon)
}
